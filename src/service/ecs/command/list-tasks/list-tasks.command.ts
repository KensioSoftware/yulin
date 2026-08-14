import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim ECS ListTasks command.
 */
export interface SimListTasksCommand {
  readonly input: SimListTasksCommandInput;
}

/**
 * Minimal structural sim ECS ListTasks input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListTasksCommand/
 */
export interface SimListTasksCommandInput {
  readonly cluster?: string | undefined;
  readonly family?: string | undefined;
  readonly desiredStatus?: string | undefined;
  readonly startedBy?: string | undefined;
  readonly launchType?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

/**
 * Minimal structural sim ECS ListTasks output.
 */
export interface SimListTasksCommandOutput {
  readonly taskArns?: readonly SimArn[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
