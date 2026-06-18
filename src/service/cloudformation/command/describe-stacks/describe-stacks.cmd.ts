import type {
  SimCloudFormationStackName,
  SimCloudFormationStackStatus,
} from "../../stack/sim-cfn-stack.js";

/**
 * Minimal structural sim CloudFormation DescribeStacks command.
 */
export interface SimDescribeStacksCommand {
  readonly input: SimDescribeStacksCommandInput;
}

/**
 * Minimal structural sim CloudFormation DescribeStacks input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/DescribeStacksCommand/
 */
export interface SimDescribeStacksCommandInput {
  readonly StackName?: string | undefined;
}

/**
 * Minimal structural sim CloudFormation DescribeStacks output.
 */
export interface SimDescribeStacksCommandOutput {
  readonly Stacks?: SimCloudFormationStackDescription[] | undefined;
  readonly $metadata: Record<string, unknown>;
}

/**
 * Minimal structural sim CloudFormation Stack description.
 */
export interface SimCloudFormationStackDescription {
  readonly StackId?: string | undefined;
  readonly StackName?: SimCloudFormationStackName | undefined;
  readonly StackStatus?: SimCloudFormationStackStatus | undefined;
  readonly StackStatusReason?: string | undefined;
}
