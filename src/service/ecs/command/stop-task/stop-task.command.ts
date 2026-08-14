import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsTaskDetail } from "../../task/sim-ecs-task-detail.js";

/**
 * Minimal structural sim ECS StopTask command.
 */
export interface SimStopTaskCommand {
  readonly input: SimStopTaskCommandInput;
}

/**
 * Minimal structural sim ECS StopTask input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/StopTaskCommand/
 */
export interface SimStopTaskCommandInput {
  readonly cluster?: string | undefined;
  readonly task?: string | undefined;
  readonly reason?: string | undefined;
}

/**
 * Minimal structural sim ECS StopTask output.
 */
export interface SimStopTaskCommandOutput {
  readonly task?: SimEcsTaskDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}
