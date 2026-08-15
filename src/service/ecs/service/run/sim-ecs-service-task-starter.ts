import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimEcsContainerBindings } from "../../bind/sim-ecs-container-bindings.js";
import type { SimEcsSecretStores } from "../../task/run/secret/sim-ecs-secret-stores.js";
import type { SimEcsTaskArn } from "../../task/sim-ecs-task-arn.js";
import { SimEcsTaskFactory } from "../../task/sim-ecs-task-factory.js";
import type { SimEcsTaskStore } from "../../task/sim-ecs-task-store.js";
import { SimEcsServiceContainers } from "./sim-ecs-service-containers.js";
import type { SimEcsServiceDeployment } from "./sim-ecs-service-deployment.js";

interface SimEcsServiceTaskStarterProperties {
  readonly tasks: SimEcsTaskStore;
  readonly taskArn: SimEcsTaskArn;
  readonly bindings: SimEcsContainerBindings;
  readonly secretStores: SimEcsSecretStores;
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
 */
export class SimEcsServiceTaskStarter {
  private readonly tasks: SimEcsTaskStore;
  private readonly background: BackgroundScheduler;
  private readonly taskFactory: SimEcsTaskFactory;
  private readonly containers: SimEcsServiceContainers;

  constructor(properties: SimEcsServiceTaskStarterProperties) {
    this.tasks = properties.tasks;
    this.background = properties.background;
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
    this.background.schedule(async () => {
      await this.containers.start(task, taskDefinition);
    });
  }
}
