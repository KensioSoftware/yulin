/**
 * Minimal structural sim CloudFormation CreateStack command.
 */
export interface SimCreateStackCommand {
  readonly input: SimCreateStackCommandInput;
}

export interface SimCreateStackParameter {
  readonly ParameterKey?: string | undefined;
  readonly ParameterValue?: string | undefined;
}

/**
 * Minimal structural sim CloudFormation CreateStack input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/CreateStackCommand/
 */
export interface SimCreateStackCommandInput {
  readonly StackName?: string | undefined;
  readonly TemplateBody?: string | undefined;
  readonly Parameters?: readonly SimCreateStackParameter[] | undefined;
}

/**
 * Minimal structural sim CloudFormation CreateStack output.
 */
export interface SimCreateStackCommandOutput {
  readonly StackId?: string;
  readonly $metadata: Record<string, unknown>;
}
