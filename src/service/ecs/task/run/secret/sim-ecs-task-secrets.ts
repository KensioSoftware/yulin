import type { SimEcsTaskDefinition } from "../../../task-definition/sim-ecs-task-definition.js";
import { SimEcsContainerSecrets } from "./sim-ecs-container-secrets.js";
import { SimEcsResolvedSecrets } from "./sim-ecs-resolved-secrets.js";
import type { SimEcsSecretStores } from "./sim-ecs-secret-stores.js";
import { SimEcsSecretResolutionError } from "./sim-ecs-secret.error.js";

/**
 * What real ECS calls a task that could not be given what it needs to start.
 */
const resourceInitializationError = "ResourceInitializationError";

interface SimEcsTaskSecretsProperties {
  readonly stores: SimEcsSecretStores;
}

/**
 * Resolves the `secrets` every container of a task definition declares.
 *
 * This happens once, before the first container runs, because a real task
 * agent pulls a task's secrets while the task is still provisioning. A secret
 * it cannot read is a resource initialization error, which stops the task
 * before anything of it has started.
 */
export class SimEcsTaskSecrets {
  private readonly stores: SimEcsSecretStores;

  constructor(properties: SimEcsTaskSecretsProperties) {
    this.stores = properties.stores;
  }

  /**
   * Resolve every container's secrets, or say why the task cannot start.
   */
  async resolve(
    taskDefinition: SimEcsTaskDefinition,
  ): Promise<SimEcsResolvedSecrets> {
    const containerSecrets = new SimEcsContainerSecrets({
      stores: this.stores,
      executionRoleArn: taskDefinition.settings.executionRoleArn,
    });
    const byContainer = new Map<string, Record<string, string>>();

    try {
      for (const declared of taskDefinition.containers.all()) {
        // oxlint-disable-next-line no-await-in-loop -- in declaration order, so a failure names the first secret that could not be read
        const resolved = await containerSecrets.resolve(declared);

        byContainer.set(declared.name, resolved);
      }
    } catch (error) {
      return SimEcsResolvedSecrets.failed(
        `${resourceInitializationError}: ${SimEcsSecretResolutionError.reasonFor(error)}`,
      );
    }

    return SimEcsResolvedSecrets.resolved(byContainer);
  }
}
