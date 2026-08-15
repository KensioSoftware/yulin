import type { SimEcsContainerDefinition } from "../../../task-definition/container/sim-ecs-container-definition.js";
import type { SimEcsSecret } from "../../../task-definition/container/sim-ecs-container-parts.js";
import { SimEcsSecretJsonKey } from "./sim-ecs-secret-json-key.js";
import { parseSimEcsSecretReference } from "./sim-ecs-secret-reference-parse.js";
import type { SimEcsSecretStores } from "./sim-ecs-secret-stores.js";
import { SimEcsSecretResolutionError } from "./sim-ecs-secret.error.js";

interface SimEcsContainerSecretsProperties {
  readonly stores: SimEcsSecretStores;
  readonly executionRoleArn: string | undefined;
}

/**
 * Resolves one container's declared `secrets` into environment variables.
 *
 * Every read is made as the task execution Role, which is the Role a real task
 * agent pulls secrets with before a container starts. It is not the task Role:
 * a Role allowed to read the secret is not thereby allowed to do what the
 * container does, and a Role allowed what the container does is not thereby
 * allowed to read the secret.
 *
 * A secret that cannot be read stops the whole task, so the reason names the
 * variable rather than the secret alone. The variable is what the container
 * code was going to read, and the name of a secret nobody could reach says
 * less about which part of the definition is wrong.
 */
export class SimEcsContainerSecrets {
  private readonly stores: SimEcsSecretStores;
  private readonly executionRoleArn: string | undefined;

  constructor(properties: SimEcsContainerSecretsProperties) {
    this.stores = properties.stores;
    this.executionRoleArn = properties.executionRoleArn;
  }

  /**
   * The variable a secret entry sets, which it has to name.
   */
  private static variableName(secret: SimEcsSecret): string {
    const { name } = secret;

    if (name === undefined || name === "") {
      throw new SimEcsSecretResolutionError(
        `unable to pull secrets: a secret naming ` +
          `${secret.valueFrom ?? "nothing"} sets no environment variable, so ` +
          `there is nothing for the container to read it as.`,
      );
    }

    return name;
  }

  private static requiredValueFrom(secret: SimEcsSecret): string {
    const { valueFrom } = secret;

    if (valueFrom === undefined || valueFrom === "") {
      throw new SimEcsSecretResolutionError(
        "it names no secret to read the value from.",
      );
    }

    return valueFrom;
  }

  /**
   * What this container's `secrets` become in its environment.
   */
  async resolve(
    declared: SimEcsContainerDefinition,
  ): Promise<Record<string, string>> {
    const resolved: [string, string][] = [];

    for (const secret of declared.secrets) {
      const name = SimEcsContainerSecrets.variableName(secret);

      // One secret at a time, so the first one that cannot be read is the one
      // the task reports, as a real task agent reports the first failure.
      // oxlint-disable-next-line no-await-in-loop
      resolved.push([name, await this.value(name, secret)]);
    }

    return Object.fromEntries(resolved);
  }

  private async value(name: string, secret: SimEcsSecret): Promise<string> {
    try {
      return await this.read(secret);
    } catch (error) {
      throw new SimEcsSecretResolutionError(
        `unable to pull secrets: ${name}: ${SimEcsSecretResolutionError.reasonFor(
          error,
        )}`,
      );
    }
  }

  private async read(secret: SimEcsSecret): Promise<string> {
    const reference = parseSimEcsSecretReference(
      SimEcsContainerSecrets.requiredValueFrom(secret),
    );
    const value = await this.stores.read({
      reference,
      caller: { kind: "arn", arn: this.requiredExecutionRoleArn() },
    });

    if (reference.jsonKey === undefined) {
      return value;
    }

    return new SimEcsSecretJsonKey(reference.jsonKey).valueIn(value);
  }

  /**
   * The Role the read is made as.
   *
   * A task definition declaring secrets and no `executionRoleArn` says so
   * rather than being read anonymously and denied. Real ECS refuses the same
   * thing, and forgetting the execution role is the ordinary way to get here.
   */
  private requiredExecutionRoleArn(): string {
    if (this.executionRoleArn === undefined || this.executionRoleArn === "") {
      throw new SimEcsSecretResolutionError(
        "the task definition declares no executionRoleArn, so there is no " +
          "Role to read it as.",
      );
    }

    return this.executionRoleArn;
  }
}
