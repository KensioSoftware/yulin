import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudFormation DeleteStack command.
 */
export interface SimDeleteStackCommand {
  readonly input: SimDeleteStackCommandInput;
}

/**
 * Minimal structural sim CloudFormation DeleteStack input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/DeleteStackCommand/
 */
export interface SimDeleteStackCommandInput {
  readonly StackName?: string | undefined;
}

/**
 * Minimal structural sim CloudFormation DeleteStack output.
 *
 * CloudFormation returns nothing beyond response metadata: the Stack is only
 * starting to delete when the call returns.
 */
export interface SimDeleteStackCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
