import type { SimEcsContainerDefinition } from "../../task-definition/container/sim-ecs-container-definition.js";
import { SimEcsContainerEnvironment } from "./sim-ecs-container-environment.js";
import type { SimEcsTaskOverrides } from "./sim-ecs-task-overrides.js";

interface SimEcsContainerEnvironmentsProperties {
  readonly regionName: string;
  readonly overrides: SimEcsTaskOverrides;
}

/**
 * The environments the containers of one task run with.
 *
 * The Region and the request's overrides belong to the task rather than to any
 * one container, so they are held here and each container's environment is
 * built from them, its own declaration and its own resolved secrets. That is
 * the same answer for a container a task runs to completion and for one a
 * service keeps polling a queue with, which is why it is given in one place.
 */
export class SimEcsContainerEnvironments {
  private readonly regionName: string;
  private readonly overrides: SimEcsTaskOverrides;

  constructor(properties: SimEcsContainerEnvironmentsProperties) {
    this.regionName = properties.regionName;
    this.overrides = properties.overrides;
  }

  /**
   * The environment one declared container runs with.
   */
  for(
    declared: SimEcsContainerDefinition,
    secrets: Record<string, string>,
  ): SimEcsContainerEnvironment {
    return new SimEcsContainerEnvironment({
      regionName: this.regionName,
      declared: declared.environment,
      secrets,
      overridden: this.overrides.environmentFor(declared.name),
    });
  }
}
