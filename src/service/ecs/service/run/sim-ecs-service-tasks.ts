import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimEcsContainerBindings } from "../../bind/sim-ecs-container-bindings.js";
import type { SimEcsSecretStores } from "../../task/run/secret/sim-ecs-secret-stores.js";
import type { SimEcsTaskArn } from "../../task/sim-ecs-task-arn.js";
import type { SimEcsTaskStore } from "../../task/sim-ecs-task-store.js";
import type { SimEcsTask } from "../../task/sim-ecs-task.js";
import type { SimEcsServiceConsumers } from "../consume/sim-ecs-service-consumers.js";
import type { SimEcsService } from "../sim-ecs-service.js";
import type { SimEcsServiceDeployment } from "./sim-ecs-service-deployment.js";
import { SimEcsServiceTaskStarter } from "./sim-ecs-service-task-starter.js";

interface SimEcsServiceTasksProperties {
  readonly tasks: SimEcsTaskStore;
  readonly taskArn: SimEcsTaskArn;
  readonly bindings: SimEcsContainerBindings;
  readonly secretStores: SimEcsSecretStores;
  readonly consumers: SimEcsServiceConsumers;
  readonly regionName: string;
  readonly background: BackgroundScheduler;
}

/**
 * Why a task of a service stopped, in each of the ways one does.
 */
const stoppedReasons = {
  scaledIn: "Task stopped by the service scaling in.",
  redeployed: "Task stopped by the service moving to another task definition.",
} as const;

/**
 * Keeps a simulated ECS service's tasks at the count it wants.
 *
 * This is where the modelling decision that runs through simulated services
 * lives. A desired count of three cannot mean three copies of one in-process
 * handler, because Yulin runs in a single Node.js process and there are no
 * containers to copy, so the count is kept as state: three tasks exist, are
 * reported as running, and hold a record of every container their definition
 * declares. The handler bound to a container is called once per request or per
 * poll rather than once per task.
 *
 * Starting a task takes until the simulator's background work reaches it, as it
 * does on real ECS. Stopping one is immediate, because there is nothing here to
 * drain.
 */
export class SimEcsServiceTasks {
  private readonly background: BackgroundScheduler;
  private readonly starter: SimEcsServiceTaskStarter;
  private readonly consumers: SimEcsServiceConsumers;

  constructor(properties: SimEcsServiceTasksProperties) {
    this.background = properties.background;
    this.starter = new SimEcsServiceTaskStarter(properties);
    this.consumers = properties.consumers;
  }

  /**
   * Bring a service's tasks to the count it wants, starting or stopping them.
   *
   * A service scaled to nothing stops consuming as well, since there is no
   * container left to be doing it. Scaling back out starts it again, because
   * the task that comes up asks for polling as any first task does.
   */
  reconcile(deployment: SimEcsServiceDeployment): void {
    const { service } = deployment;
    const shortfall = service.desiredCount - service.tasks.count;

    if (shortfall > 0) {
      this.starter.start(deployment, shortfall);
      return;
    }

    this.stopEach(
      service.tasks.takeNewest(-shortfall),
      stoppedReasons.scaledIn,
    );

    if (service.tasks.count === 0) {
      this.consumers.stop(service);
    }
  }

  /**
   * Replace every task with one started from the revision the service is on.
   *
   * Real ECS replaces them a few at a time under a deployment configuration,
   * bringing new ones up before old ones go down. Nothing is served here yet
   * and nothing takes any time to start, so the replacement happens at once.
   */
  redeploy(deployment: SimEcsServiceDeployment): void {
    this.stopAll(deployment.service, stoppedReasons.redeployed);
    this.reconcile(deployment);
  }

  /**
   * Stop every task a service is running, and give up holding them.
   *
   * The queue polling its containers were doing stops with them. A redeploy
   * comes back through here and then starts again from the revision the
   * service moved to, so a container that stopped consuming, or started, in the
   * new revision is polled for accordingly.
   */
  stopAll(service: SimEcsService, reason: string): void {
    this.consumers.stop(service);
    this.stopEach(service.tasks.takeAll(), reason);
  }

  private stopEach(tasks: readonly SimEcsTask[], reason: string): void {
    const at = this.background.now();

    for (const task of tasks) {
      task.requestStop(reason);
      task.stop({ at, stopCode: "UserInitiated", reason });
    }
  }
}
