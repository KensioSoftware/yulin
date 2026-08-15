import type { SimEcsContainerDefinition } from "../task-definition/container/sim-ecs-container-definition.js";
import { SimEcsBoundContainer } from "./sim-ecs-bound-container.js";
import type { SimEcsContainerBinding } from "./sim-ecs-container-binding.type.js";

/**
 * The executable bindings one simulated ECS scope holds.
 *
 * Bindings belong to the scope they were made in, as the task definitions they
 * target do. A binding made against one Account and Region reaches no
 * container in another.
 *
 * Two bindings can match the same container, so the order they are searched in
 * is part of the behaviour: a binding naming the container directly beats one
 * naming an image repository, and the most recently made of equally specific
 * bindings wins. That makes binding the same container again replace what it
 * runs, which is what a test setting up a case wants.
 */
export class SimEcsContainerBindings {
  private readonly bindings: SimEcsBoundContainer[] = [];

  /**
   * Hold an executable binding, refusing one that could never match.
   */
  add(binding: SimEcsContainerBinding): void {
    this.bindings.push(new SimEcsBoundContainer(binding));
  }

  /**
   * The binding a container of a family runs, if anything is bound to it.
   */
  find(
    family: string,
    container: SimEcsContainerDefinition,
  ): SimEcsBoundContainer | undefined {
    const matching = this.bindings
      .filter((binding) => binding.targets(family, container))
      .toReversed();

    return (
      matching.find((binding) => binding.isNamedTarget()) ?? matching.at(0)
    );
  }
}
