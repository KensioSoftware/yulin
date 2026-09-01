import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCreateStackParameter } from "../create-stack/create-stack.command.js";

/**
 * Minimal structural sim CloudFormation CreateChangeSet command.
 */
export interface SimCreateChangeSetCommand {
  readonly input: SimCreateChangeSetCommandInput;
}

/**
 * Minimal structural sim CloudFormation CreateChangeSet input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/CreateChangeSetCommand/
 */
export interface SimCreateChangeSetCommandInput {
  readonly StackName?: string | undefined;
  readonly ChangeSetName?: string | undefined;
  readonly ChangeSetType?: string | undefined;
  readonly TemplateBody?: string | undefined;
  readonly Parameters?: readonly SimCreateStackParameter[] | undefined;
  readonly Description?: string | undefined;
}

/**
 * Minimal structural sim CloudFormation CreateChangeSet output.
 *
 * CloudFormation returns the change set ARN and the Stack ID. The changes it
 * describes are only being worked out when the call returns.
 */
export interface SimCreateChangeSetCommandOutput {
  readonly Id?: string;
  readonly StackId?: string;
  readonly $metadata: SimResponseMetadata;
}
