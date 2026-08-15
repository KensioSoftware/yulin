import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimEcsContainerBindings } from "../../bind/sim-ecs-container-bindings.js";
import { simEcsNotSimulatedContainerReason } from "../../task/run/sim-ecs-container-reason.js";
import type { SimEcsResolvedSecrets } from "../../task/run/secret/sim-ecs-resolved-secrets.js";
import type { SimEcsSecretStores } from "../../task/run/secret/sim-ecs-secret-stores.js";
import { SimEcsTaskSecrets } from "../../task/run/secret/sim-ecs-task-secrets.js";
import type { SimEcsTask } from "../../task/sim-ecs-task.js";
import type { SimEcsServiceConsumers } from "../consume/sim-ecs-service-consumers.js";
import { SimEcsServiceConsumption } from "./sim-ecs-service-consumption.js";
import type { SimEcsServiceDeployment } from "./sim-ecs-service-deployment.js";

interface SimEcsServiceContainersProperties {
  readonly bindings: SimEcsContainerBindings;
  readonly secretStores: SimEcsSecretStores;
  readonly consumers: SimEcsServiceConsumers;
  readonly regionName: string;
  readonly background: BackgroundScheduler;
}

/**
 * Brings the containers of one task of a service up.
 *
 * No handler is run to completion here, which is the difference between a
 * service container and one of a task started by `RunTask`. A service container
 * is treated as running from this point, and what calls its handler is whatever
 * reaches it: a request served to it, or a poll it makes. A container bound to
 * consume a queue is the one kind that starts something of its own, which is
 * the polling Yulin does on its behalf. A container with no binding is recorded
 * as not simulated instead, exactly as one of a run task is.
 *
 * A task's secrets are still resolved before it starts, as a real task agent
 * pulls them while the task is provisioning. A secret that cannot be read stops
 * the task here as it stops a run task, so a service naming one that is not
 * there says so rather than reporting a task running against it.
 */
export class SimEcsServiceContainers {
  private readonly bindings: SimEcsContainerBindings;
  private readonly background: BackgroundScheduler;
  private readonly secrets: SimEcsTaskSecrets;
  private readonly consumption: SimEcsServiceConsumption;

  constructor(properties: SimEcsServiceContainersProperties) {
    this.bindings = properties.bindings;
    this.background = properties.background;
    this.secrets = new SimEcsTaskSecrets({ stores: properties.secretStores });
    this.consumption = new SimEcsServiceConsumption(properties);
  }

  /**
   * Mark a task, and the containers something is bound to, as running.
   *
   * A task asked to stop before this reached it stays stopped, so a service
   * deleted between the request and the background work brings nothing up.
   */
  async start(
    task: SimEcsTask,
    deployment: SimEcsServiceDeployment,
  ): Promise<void> {
    if (task.isStopRequested) {
      return;
    }

    const secrets = await this.secrets.resolve(deployment.taskDefinition);

    if (!secrets.isResolved) {
      task.failToStart(this.background.now(), secrets.failureReason);
      return;
    }

    task.start(this.background.now());
    this.markContainers(task, deployment, secrets);
  }

  private markContainers(
    task: SimEcsTask,
    deployment: SimEcsServiceDeployment,
    secrets: SimEcsResolvedSecrets,
  ): void {
    for (const declared of deployment.taskDefinition.containers.all()) {
      const container = task.container(declared.name);
      const bound = this.bindings.find(task.family, declared);

      if (bound === undefined) {
        container.neverStarted(simEcsNotSimulatedContainerReason);
        continue;
      }

      container.start();
      this.consumption.begin({ deployment, declared, bound, secrets });
    }
  }
}
