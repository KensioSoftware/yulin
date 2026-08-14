import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import { SimEcsTaskOverrides } from "../../task/run/sim-ecs-task-overrides.js";
import { SimEcsTaskDefinitionId } from "../../task-definition/sim-ecs-task-definition-id.js";
import type { SimRunTaskCommandInput } from "./run-task.command.js";

/**
 * How many tasks one request may start, as real ECS limits it.
 */
const maxCount = 10;

/**
 * What one `RunTask` request asked for.
 *
 * This is the part of the request that can be read before anything is looked
 * up: which task definition, how many tasks, and what the request overrides. A
 * malformed request is malformed whoever made it and whatever state there is,
 * so it is read first and refused first.
 */
export class SimEcsRunTaskRequest {
  public readonly taskDefinitionId: SimEcsTaskDefinitionId;
  public readonly overrides: SimEcsTaskOverrides;
  public readonly count: number;

  constructor(
    input: SimRunTaskCommandInput,
    accountRegionScope: SimAwsAccountRegionScope,
  ) {
    this.taskDefinitionId = SimEcsTaskDefinitionId.parse(
      input.taskDefinition,
      accountRegionScope,
    );
    this.overrides = new SimEcsTaskOverrides(input.overrides);
    this.count = SimEcsRunTaskRequest.requestedCount(input.count);
  }

  /**
   * How many tasks the request asked to start.
   */
  private static requestedCount(count: number | undefined): number {
    if (count === undefined) {
      return 1;
    }

    if (!Number.isSafeInteger(count) || count < 1 || count > maxCount) {
      throw new SimEcsInvalidParameterException(
        `count must be a whole number from 1 to ${String(maxCount)}.`,
      );
    }

    return count;
  }
}
