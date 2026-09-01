import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimCfnChangeSetExecutionStatus,
  SimCfnChangeSetStatus,
  SimCfnResourceChangeAction,
} from "../../changeset/sim-cfn-change-set.type.js";

/**
 * Minimal structural sim CloudFormation DescribeChangeSet command.
 */
export interface SimDescribeChangeSetCommand {
  readonly input: SimDescribeChangeSetCommandInput;
}

/**
 * Minimal structural sim CloudFormation DescribeChangeSet input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/DescribeChangeSetCommand/
 */
export interface SimDescribeChangeSetCommandInput {
  readonly ChangeSetName?: string | undefined;
  readonly StackName?: string | undefined;
}

/**
 * Minimal structural sim CloudFormation DescribeChangeSet output.
 */
export interface SimDescribeChangeSetCommandOutput {
  readonly ChangeSetId?: string | undefined;
  readonly ChangeSetName?: string | undefined;
  readonly StackId?: string | undefined;
  readonly StackName?: string | undefined;
  readonly Description?: string | undefined;
  readonly Status?: SimCfnChangeSetStatus | undefined;
  readonly StatusReason?: string | undefined;
  readonly ExecutionStatus?: SimCfnChangeSetExecutionStatus | undefined;
  readonly Changes?: SimCfnChangeDescription[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudFormation Change description.
 */
export interface SimCfnChangeDescription {
  readonly Type: "Resource";
  readonly ResourceChange: SimCfnResourceChangeDescription;
}

/**
 * Minimal structural sim CloudFormation ResourceChange description.
 */
export interface SimCfnResourceChangeDescription {
  readonly Action?: SimCfnResourceChangeAction | undefined;
  readonly LogicalResourceId?: string | undefined;
  readonly ResourceType?: string | undefined;
  readonly Replacement?: string | undefined;
}
