import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimSqsPollQueues } from "../../../sqs/poll/sim-sqs-poll-queues.js";
import { SimSqsQueuePoller } from "../../../sqs/poll/sim-sqs-queue-poller.js";
import type { SimEcsBoundQueueConsumer } from "../../bind/sim-ecs-bound-queue-consumer.js";
import type { SimEcsContainerEnvironment } from "../../task/run/sim-ecs-container-environment.js";
import { SimEcsContainerConsumer } from "./sim-ecs-container-consumer.js";

/**
 * What a service names the queue polling it is keeping.
 */
export interface SimEcsConsumingService {
  readonly clusterName: string;
  readonly serviceName: string;
}

/**
 * One container of one service, ready to start consuming its queue.
 */
export interface SimEcsStartingConsumer extends SimEcsConsumingService {
  readonly containerName: string;
  readonly consumes: SimEcsBoundQueueConsumer;
  readonly environment: SimEcsContainerEnvironment;
  readonly taskRoleArn: string | undefined;
}

interface SimEcsServiceConsumersProperties {
  readonly queues: SimSqsPollQueues;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly background: BackgroundScheduler;
}

/**
 * The queue polling the services of one simulated ECS scope are keeping.
 *
 * One poller per service and container, rather than one per task. That follows
 * the modelling decision a service already rests on: a desired count of three
 * is three simulated tasks reported as running rather than three copies of one
 * in-process handler, so a handler is called once per poll however many tasks
 * the count says. Three real containers would each run their own loop and share
 * the queue between them, which comes to the same messages being handled once.
 *
 * Polling is held here rather than on the service, because a service is state a
 * request can read and a poller is the running thing behind it. Keeping them
 * apart is what gives deleting a service somewhere to stop the polling, and it
 * is why nothing is left scheduled once a service has gone.
 */
export class SimEcsServiceConsumers {
  private readonly pollers = new Map<string, Map<string, SimSqsQueuePoller>>();
  private readonly properties: SimEcsServiceConsumersProperties;

  constructor(properties: SimEcsServiceConsumersProperties) {
    this.properties = properties;
  }

  private static keyFor(service: SimEcsConsumingService): string {
    return `${service.clusterName}/${service.serviceName}`;
  }

  /**
   * Start polling for a container of a service that has come up, unless it is
   * already being polled for.
   *
   * Every task of the service reaches this as it starts, and the second one
   * finds the first one's poller. Whatever is already on the queue is polled
   * for straight away, because a service is not only sent messages after it
   * started.
   */
  ensure(starting: SimEcsStartingConsumer): void {
    const containers = this.containersOf(starting);

    if (containers.has(starting.containerName)) {
      return;
    }

    const poller = new SimSqsQueuePoller({
      queues: this.properties.queues,
      queueArn: starting.consumes.queueArn,
      consumer: new SimEcsContainerConsumer({
        ...starting,
        runAsOwner: this.properties.runAsOwner,
      }),
      background: this.properties.background,
    });

    containers.set(starting.containerName, poller);
    poller.watch();
    poller.pollNow();
  }

  /**
   * Stop the polling a service is keeping, as deleting it does.
   *
   * Nothing is left watching the queue and nothing is left waiting on the
   * clock, so an environment finished with leaves no polling behind. Stopping a
   * service that was consuming nothing does nothing.
   */
  stop(service: SimEcsConsumingService): void {
    const key = SimEcsServiceConsumers.keyFor(service);
    const containers =
      this.pollers.get(key) ?? new Map<string, SimSqsQueuePoller>();

    for (const poller of containers.values()) {
      poller.stop();
    }

    this.pollers.delete(key);
  }

  private containersOf(
    service: SimEcsConsumingService,
  ): Map<string, SimSqsQueuePoller> {
    const key = SimEcsServiceConsumers.keyFor(service);
    const held = this.pollers.get(key);

    if (held !== undefined) {
      return held;
    }

    const containers = new Map<string, SimSqsQueuePoller>();
    this.pollers.set(key, containers);

    return containers;
  }
}
