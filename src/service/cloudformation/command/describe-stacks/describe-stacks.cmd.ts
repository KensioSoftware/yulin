import type {
  SimCloudFormationStackName,
  SimCloudFormationStackStatus,
} from "../../stack/sim-cfn-stack.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";

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
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudFormation Stack description.
 */
export interface SimCloudFormationStackDescription {
  readonly StackId?: string | undefined;
  readonly StackName?: SimCloudFormationStackName | undefined;
  readonly StackStatus?: SimCloudFormationStackStatus | undefined;
  readonly StackStatusReason?: string | undefined;
  readonly Outputs?: SimCloudFormationStackOutputDescription[] | undefined;
}

/**
 * Minimal structural sim CloudFormation Stack Output description.
 */
export interface SimCloudFormationStackOutputDescription {
  readonly OutputKey?: string | undefined;
  readonly OutputValue?: SimCfnTemplateValue | undefined;
  readonly Description?: string | undefined;
  readonly ExportName?: SimCfnTemplateValue | undefined;
}
