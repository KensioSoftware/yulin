import { SimEcsClientException } from "../../error/sim-ecs.error.js";
import {
  SimEcsContainerDefinition,
  type SimEcsContainerDefinitionType,
} from "./sim-ecs-container-definition.js";

/**
 * The containers one simulated ECS task definition declares.
 *
 * A task definition needs at least one container, and no two of them may share
 * a name, because a name is how everything else in ECS refers to a container:
 * a dependency, an override, and the binding a simulated task run would look
 * up.
 */
export class SimEcsContainerDefinitions {
  private readonly containers: readonly SimEcsContainerDefinition[];

  constructor(declared: readonly SimEcsContainerDefinitionType[] | undefined) {
    this.containers = SimEcsContainerDefinitions.declaredContainers(declared);
    this.refuseRepeatedNames();
  }

  private static declaredContainers(
    declared: readonly SimEcsContainerDefinitionType[] | undefined,
  ): readonly SimEcsContainerDefinition[] {
    if (declared === undefined || declared.length === 0) {
      throw new SimEcsClientException(
        "A task definition must declare at least one container definition.",
      );
    }

    return declared.map(
      (container) => new SimEcsContainerDefinition(container),
    );
  }

  /**
   * The containers this task definition declares, in declaration order.
   */
  all(): readonly SimEcsContainerDefinition[] {
    return this.containers;
  }

  /**
   * Whether a container of this name is one of them.
   */
  has(name: string): boolean {
    return this.containers.some((container) => container.name === name);
  }

  /**
   * These containers as a described task definition reports them.
   */
  toOutput(): readonly SimEcsContainerDefinitionType[] {
    return this.containers.map((container) => container.toOutput());
  }

  private refuseRepeatedNames(): void {
    const seen = new Set<string>();

    for (const container of this.containers) {
      if (seen.has(container.name)) {
        throw new SimEcsClientException(
          `Container names must be unique within a task definition: ` +
            `${container.name} is declared more than once.`,
        );
      }

      seen.add(container.name);
    }
  }
}
