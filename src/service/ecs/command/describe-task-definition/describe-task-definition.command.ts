import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsTag } from "../../task-definition/sim-ecs-task-definition-parts.js";
import type { SimEcsTaskDefinitionDetail } from "../../task-definition/sim-ecs-task-definition-detail.js";

/**
 * Minimal structural sim ECS DescribeTaskDefinition command.
 */
export interface SimDescribeTaskDefinitionCommand {
  readonly input: SimDescribeTaskDefinitionCommandInput;
}

/**
 * Minimal structural sim ECS DescribeTaskDefinition input.
 *
 * `taskDefinition` takes a family, a `family:revision`, or a full ARN.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeTaskDefinitionCommand/
 */
export interface SimDescribeTaskDefinitionCommandInput {
  readonly taskDefinition?: string | undefined;
  readonly include?: readonly string[] | undefined;
}

/**
 * Minimal structural sim ECS DescribeTaskDefinition output.
 */
export interface SimDescribeTaskDefinitionCommandOutput {
  readonly taskDefinition?: SimEcsTaskDefinitionDetail | undefined;
  readonly tags?: readonly SimEcsTag[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
