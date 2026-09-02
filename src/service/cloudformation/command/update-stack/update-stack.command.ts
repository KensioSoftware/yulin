import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCreateStackParameter } from "../create-stack/create-stack.command.js";

/**
 * Minimal structural sim CloudFormation UpdateStack command.
 */
export interface SimUpdateStackCommand {
  readonly input: SimUpdateStackCommandInput;
}

/**
 * A Parameter value an update supplies, or asks the Stack for.
 *
 * An update names every Parameter the template declares, so one whose value has
 * not changed is carried by `UsePreviousValue` rather than being written out
 * again. Supplying both that and a `ParameterValue` says two things at once,
 * and is refused.
 */
export interface SimUpdateStackParameter extends SimCreateStackParameter {
  readonly UsePreviousValue?: boolean | undefined;
}

/**
 * Minimal structural sim CloudFormation UpdateStack input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/UpdateStackCommand/
 */
export interface SimUpdateStackCommandInput {
  readonly StackName?: string | undefined;
  readonly TemplateBody?: string | undefined;

  /**
   * Update from the template the Stack already holds, which is how a Parameter
   * value is changed on its own. Supplying a `TemplateBody` as well is refused.
   */
  readonly UsePreviousTemplate?: boolean | undefined;

  readonly Parameters?: readonly SimUpdateStackParameter[] | undefined;
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
