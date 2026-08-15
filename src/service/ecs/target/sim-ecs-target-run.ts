import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEcsTargetTask } from "./sim-ecs-target-task.js";

interface SimEcsTargetRunProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * One task an event target or a schedule target is asking for.
 */
export interface SimEcsTargetRunRequest {
  /**
   * The cluster, as the target ARN names it.
   */
  readonly cluster: string;

  readonly task: SimEcsTargetTask;

  /**
   * The session of the target's role, which is who runs the task.
   */
  readonly caller: SimAwsCaller;
}

/**
 * Runs the task an EventBridge or Scheduler target names.
 *
 * It goes through `RunTask` rather than through the runner behind it, so a
 * task started by a rule or a schedule is the same task as one started by a
 * caller: the same cluster and revision lookups, the same refusals, the same
 * IAM decision against `ecs:RunTask`, and the same task state afterwards. The
 * role's permission to run the task is therefore ECS's own answer rather than
 * a second one kept here.
 *
 * `RunTask` answers before the containers run, as real ECS does. That is the
 * right moment to return to: the delivery has been made, and what the task
 * does happens on the simulator's background work like the rest of it.
 */
export class SimEcsTargetRun {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimEcsTargetRunProperties) {
    this.scope = properties.scope;
  }

  /**
   * Run the target's task as the target's role.
   */
  async run(request: SimEcsTargetRunRequest): Promise<void> {
    const { parameters, overrides } = request.task;

    await this.scope.ecs().runTask(
      {
        input: {
          cluster: request.cluster,
          taskDefinition: parameters.taskDefinitionArn,
          count: parameters.taskCount,
          overrides,
        },
      },
      { caller: request.caller },
    );
  }
}
