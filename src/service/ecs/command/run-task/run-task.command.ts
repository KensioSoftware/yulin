import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsTaskOverrideType } from "../../task/run/sim-ecs-task-overrides.js";
import type { SimEcsTaskDetail } from "../../task/sim-ecs-task-detail.js";
import type { SimEcsFailure } from "../describe-clusters/describe-clusters.command.js";

/**
 * Minimal structural sim ECS RunTask command.
 */
export interface SimRunTaskCommand {
  readonly input: SimRunTaskCommandInput;
}

/**
 * Minimal structural sim ECS RunTask input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/RunTaskCommand/
 */
export interface SimRunTaskCommandInput {
  readonly cluster?: string | undefined;
  readonly taskDefinition?: string | undefined;
  readonly count?: number | undefined;
  readonly group?: string | undefined;
  readonly launchType?: string | undefined;
  readonly startedBy?: string | undefined;
  readonly overrides?: SimEcsTaskOverrideType | undefined;
}

/**
 * Minimal structural sim ECS RunTask output.
 */
export interface SimRunTaskCommandOutput {
  readonly tasks?: readonly SimEcsTaskDetail[] | undefined;
  readonly failures?: readonly SimEcsFailure[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
