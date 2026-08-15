import { SimEcsUnsimulatedInput } from "../../command/sim-ecs-unsimulated-input.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcsContainerDefinitions } from "../../task-definition/container/sim-ecs-container-definitions.js";
import type { SimEcsKeyValuePair } from "../../task-definition/container/sim-ecs-container-parts.js";

/**
 * Minimal structural sim ECS container override.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerOverride.html
 */
export interface SimEcsContainerOverrideType {
  readonly name?: string | undefined;
  readonly environment?: readonly SimEcsKeyValuePair[] | undefined;
}

/**
 * Minimal structural sim ECS task override.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_TaskOverride.html
 */
export interface SimEcsTaskOverrideType {
  readonly taskRoleArn?: string | undefined;
  readonly containerOverrides?:
    | readonly SimEcsContainerOverrideType[]
    | undefined;
}

/**
 * What a `RunTask` request may override.
 *
 * The task Role is here because it is the identity the containers' AWS calls
 * are attributed to, and the container environment because it is what the
 * running code reads. Anything else a real override carries is about resources
 * or the command an image runs, neither of which exists here, so it is refused
 * rather than accepted and ignored.
 */
const acceptedOverrides: readonly string[] = [
  "taskRoleArn",
  "containerOverrides",
];

const acceptedContainerOverrides: readonly string[] = ["name", "environment"];

/**
 * The overrides one `RunTask` request made.
 *
 * A container override names the container it applies to, so an override
 * naming a container the task definition does not declare is refused. Real ECS
 * refuses it too, and it is worth refusing: the usual cause is a container
 * renamed in the definition and not in the test, where the override silently
 * doing nothing is the wrong answer.
 */
export class SimEcsTaskOverrides {
  public readonly taskRoleArn: string | undefined;

  private readonly containerOverrides: readonly SimEcsContainerOverrideType[];

  constructor(declared: SimEcsTaskOverrideType | undefined) {
    const unsimulated = new SimEcsUnsimulatedInput("RunTask overrides");
    unsimulated.refuseUnaccepted(declared ?? {}, acceptedOverrides);

    this.taskRoleArn = declared?.taskRoleArn;
    // Copied rather than held by reference, since the caller owns what it
    // passed in and the containers read it later, on background work.
    this.containerOverrides = structuredClone(
      declared?.containerOverrides ?? [],
    );

    for (const override of this.containerOverrides) {
      new SimEcsUnsimulatedInput("RunTask containerOverrides").refuseUnaccepted(
        override,
        acceptedContainerOverrides,
      );
    }
  }

  /**
   * Refuse an override naming a container this task definition has not got.
   */
  refuseUnknownContainers(containers: SimEcsContainerDefinitions): void {
    for (const override of this.containerOverrides) {
      if (override.name !== undefined && !containers.has(override.name)) {
        throw new SimEcsInvalidParameterException(
          `The container override for ${override.name} does not name a ` +
            `container this task definition declares.`,
        );
      }
    }
  }

  /**
   * The environment variables overridden for one container.
   */
  environmentFor(containerName: string): readonly SimEcsKeyValuePair[] {
    const override = this.containerOverrides.find(
      (candidate) => candidate.name === containerName,
    );

    return override?.environment ?? [];
  }
}
