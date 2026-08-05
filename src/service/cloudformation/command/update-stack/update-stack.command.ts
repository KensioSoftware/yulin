import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCreateStackParameter } from "../create-stack/create-stack.command.js";

/**
 * Minimal structural sim CloudFormation UpdateStack command.
 */
export interface SimUpdateStackCommand {
  readonly input: SimUpdateStackCommandInput;
}

/**
 * Minimal structural sim CloudFormation UpdateStack input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/UpdateStackCommand/
 */
export interface SimUpdateStackCommandInput {
  readonly StackName?: string | undefined;
  readonly TemplateBody?: string | undefined;
  readonly Parameters?: readonly SimCreateStackParameter[] | undefined;
}

/**
 * Minimal structural sim CloudFormation UpdateStack output.
 *
 * CloudFormation returns the Stack ID: the Resources are only starting to
 * change when the call returns.
 */
export interface SimUpdateStackCommandOutput {
  readonly StackId?: string;
  readonly $metadata: SimResponseMetadata;
}
