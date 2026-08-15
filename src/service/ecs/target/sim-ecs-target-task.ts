import type { SimEcsTaskOverrideType } from "../task/run/sim-ecs-task-overrides.js";
import { simEcsTargetOverrides } from "./sim-ecs-target-overrides.js";
import { SimEcsTargetParameters } from "./sim-ecs-target-parameters.js";

/**
 * What a target request says about the task it runs.
 */
export interface SimEcsTargetTaskProperties {
  readonly EcsParameters?: unknown;
  readonly Input?: string | undefined;
}

/**
 * The task one EventBridge rule target or Scheduler schedule target runs.
 *
 * Both services describe it the same way, in `EcsParameters` and an `Input`,
 * so both read it here. What they do not share is who runs it: a rule carries
 * the role on the target itself, and a schedule already has an execution role
 * for every target it has.
 */
export class SimEcsTargetTask {
  public readonly parameters: SimEcsTargetParameters;

  /**
   * What the target's `Input` overrides on the task, where it had one.
   */
  public readonly overrides: SimEcsTaskOverrideType | undefined;

  private constructor(
    parameters: SimEcsTargetParameters,
    overrides: SimEcsTaskOverrideType | undefined,
  ) {
    this.parameters = parameters;
    this.overrides = overrides;
  }

  /**
   * Read the task a target runs, refusing one that could not be run.
   *
   * The refusals happen where the target was written rather than at the first
   * delivery, so a target that names no task definition, or an `Input` that is
   * not the overrides it has to be, is reported to whoever wrote it.
   */
  static of(
    target: SimEcsTargetTaskProperties,
    refuse: (reason: string) => Error,
  ): SimEcsTargetTask {
    return new this(
      SimEcsTargetParameters.of(target.EcsParameters, refuse),
      simEcsTargetOverrides(target.Input, refuse),
    );
  }
}
