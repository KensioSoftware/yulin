import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudFormation ExecuteChangeSet command.
 */
export interface SimExecuteChangeSetCommand {
  readonly input: SimExecuteChangeSetCommandInput;
}

/**
 * Minimal structural sim CloudFormation ExecuteChangeSet input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/ExecuteChangeSetCommand/
 */
export interface SimExecuteChangeSetCommandInput {
  readonly ChangeSetName?: string | undefined;
  readonly StackName?: string | undefined;
}

/**
 * Minimal structural sim CloudFormation ExecuteChangeSet output.
 *
 * CloudFormation returns nothing beyond response metadata. The Stack is only
 * starting to change when the call returns.
 */
export interface SimExecuteChangeSetCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
