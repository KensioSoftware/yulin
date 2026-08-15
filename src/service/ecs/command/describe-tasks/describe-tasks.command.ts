import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsTaskDetail } from "../../task/sim-ecs-task-detail.js";
import type { SimEcsFailure } from "../describe-clusters/describe-clusters.command.js";

/**
 * Minimal structural sim ECS DescribeTasks command.
 */
export interface SimDescribeTasksCommand {
  readonly input: SimDescribeTasksCommandInput;
}

/**
 * Minimal structural sim ECS DescribeTasks input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeTasksCommand/
 */
export interface SimDescribeTasksCommandInput {
  readonly cluster?: string | undefined;
  readonly tasks?: readonly string[] | undefined;
}

/**
 * Minimal structural sim ECS DescribeTasks output.
 */
export interface SimDescribeTasksCommandOutput {
  readonly tasks?: readonly SimEcsTaskDetail[] | undefined;
  readonly failures?: readonly SimEcsFailure[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
