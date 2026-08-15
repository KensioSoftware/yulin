import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimEcsContainerBindings } from "../../bind/sim-ecs-container-bindings.js";
import type { SimEcsServiceTargets } from "../load-balancer/sim-ecs-service-targets.js";
import type { SimEcsServiceServers } from "../serve/sim-ecs-service-servers.js";
import type { SimEcsSecretStores } from "../../task/run/secret/sim-ecs-secret-stores.js";
import type { SimEcsTaskArn } from "../../task/sim-ecs-task-arn.js";
import { SimEcsTaskFactory } from "../../task/sim-ecs-task-factory.js";
import type { SimEcsTaskStore } from "../../task/sim-ecs-task-store.js";
import type { SimEcsServiceConsumers } from "../consume/sim-ecs-service-consumers.js";
import { SimEcsServiceContainers } from "./sim-ecs-service-containers.js";
import type { SimEcsServiceDeployment } from "./sim-ecs-service-deployment.js";

/**
 * What starting and stopping a service's tasks is done with.
 *
 * It is exported because `SimEcsServiceTasks` is built with exactly this: it
 * holds the starter, and everything it does itself is done with the same
 * collaborators.
 */
export interface SimEcsServiceTaskStarterProperties {
  readonly tasks: SimEcsTaskStore;
  readonly taskArn: SimEcsTaskArn;
  readonly bindings: SimEcsContainerBindings;
  readonly secretStores: SimEcsSecretStores;
  readonly consumers: SimEcsServiceConsumers;
  readonly servers: SimEcsServiceServers;
  readonly targets: SimEcsServiceTargets;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly regionName: string;
  readonly background: BackgroundScheduler;
}

/**
 * Starts the tasks a simulated ECS service keeps running.
 *
 * A task exists as soon as the request that asked for it is answered, so it is
 * listed straight away, and reaches `RUNNING` on the simulator's background
 * work. That is what real ECS does with a service that has just been created or
 * scaled out, and it is what makes a service deleted in between bring nothing
 * up.
 *
 * A service's tasks carry the group and the `startedBy` real ECS gives one, so
 * a listing can be narrowed to the service that is keeping them.
 *
 * A task is registered as a load balancer target as it is started rather than
 * once it is running, because there is no health check here for a target to
 * pass: real ECS registers a task as soon as it has an address, and waits for
 * the target to be healthy before sending it anything.
 */
export class SimEcsServiceTaskStarter {
  private readonly tasks: SimEcsTaskStore;
  private readonly background: BackgroundScheduler;
  private readonly taskFactory: SimEcsTaskFactory;
  private readonly containers: SimEcsServiceContainers;
  private readonly targets: SimEcsServiceTargets;

  constructor(properties: SimEcsServiceTaskStarterProperties) {
    this.tasks = properties.tasks;
    this.background = properties.background;
    this.targets = properties.targets;
    this.taskFactory = new SimEcsTaskFactory(properties.taskArn);
    this.containers = new SimEcsServiceContainers(properties);
  }

  /**
   * Start a number of tasks for a service, and hand them to it.
   */
  start(deployment: SimEcsServiceDeployment, count: number): void {
    for (let started = 0; started < count; started += 1) {
      this.startOne(deployment);
    }
  }

  private startOne(deployment: SimEcsServiceDeployment): void {
    const { service, cluster, taskDefinition } = deployment;
    const task = this.taskFactory.make({
      cluster,
      taskDefinition,
      createdAt: this.background.now(),
      group: `service:${service.serviceName}`,
      startedBy: `ecs-svc/${service.serviceName}`,
      serviceName: service.serviceName,
      launchType: service.launchType,
    });

    this.tasks.put(task);
    service.tasks.add(task);
    this.targets.register(service, task);
    this.background.schedule(async () => {
      await this.containers.start(task, deployment);
    });
  }
}
