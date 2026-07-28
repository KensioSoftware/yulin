import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * A parameter as sim SSM reports it in a value-carrying response.
 *
 * https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_Parameter.html
 */
export interface SimSsmParameterOutput {
  readonly ARN?: string | undefined;
  readonly DataType?: string | undefined;
  readonly LastModifiedDate?: Date | undefined;
  readonly Name?: string | undefined;
  readonly Selector?: string | undefined;
  readonly Type?: string | undefined;
  readonly Value?: string | undefined;
  readonly Version?: number | undefined;
}

/**
 * A parameter as sim SSM reports it in a metadata-only response, which
 * carries no value.
 *
 * https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_ParameterMetadata.html
 */
export interface SimSsmParameterMetadata {
  readonly ARN?: string | undefined;
  readonly DataType?: string | undefined;
  readonly Description?: string | undefined;
  readonly KeyId?: string | undefined;
  readonly LastModifiedDate?: Date | undefined;
  readonly LastModifiedUser?: string | undefined;
  readonly Name?: string | undefined;
  readonly Policies?: readonly unknown[] | undefined;
  readonly Tier?: string | undefined;
  readonly Type?: string | undefined;
  readonly Version?: number | undefined;
}

/**
 * A tag on a parameter, which sim SSM refuses rather than stores.
 */
export interface SimSsmTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim SSM PutParameter command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/PutParameterCommand/
 */
export interface SimPutParameterCommand {
  readonly input: SimPutParameterCommandInput;
}

export interface SimPutParameterCommandInput {
  readonly Name?: string | undefined;
  readonly Value?: string | undefined;
  readonly Type?: string | undefined;
  readonly Description?: string | undefined;
  readonly Overwrite?: boolean | undefined;
  readonly DataType?: string | undefined;
  readonly Tier?: string | undefined;
  readonly AllowedPattern?: string | undefined;
  readonly KeyId?: string | undefined;
  readonly Policies?: string | undefined;
  readonly Tags?: readonly SimSsmTag[] | undefined;
}

export interface SimPutParameterCommandOutput {
  readonly Version?: number | undefined;
  readonly Tier?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SSM DeleteParameter command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/DeleteParameterCommand/
 */
export interface SimDeleteParameterCommand {
  readonly input: SimDeleteParameterCommandInput;
}

export interface SimDeleteParameterCommandInput {
  readonly Name?: string | undefined;
}

export interface SimDeleteParameterCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SSM DeleteParameters command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/DeleteParametersCommand/
 */
export interface SimDeleteParametersCommand {
  readonly input: SimDeleteParametersCommandInput;
}

export interface SimDeleteParametersCommandInput {
  readonly Names?: readonly string[] | undefined;
}

export interface SimDeleteParametersCommandOutput {
  readonly DeletedParameters?: readonly string[] | undefined;
  readonly InvalidParameters?: readonly string[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
