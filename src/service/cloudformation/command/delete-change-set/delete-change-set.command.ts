import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudFormation DeleteChangeSet command.
 */
export interface SimDeleteChangeSetCommand {
  readonly input: SimDeleteChangeSetCommandInput;
}

/**
 * Minimal structural sim CloudFormation DeleteChangeSet input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/DeleteChangeSetCommand/
 */
export interface SimDeleteChangeSetCommandInput {
  readonly ChangeSetName?: string | undefined;
  readonly StackName?: string | undefined;
}

/**
 * Minimal structural sim CloudFormation DeleteChangeSet output.
 */
export interface SimDeleteChangeSetCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
