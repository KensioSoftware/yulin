import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimSsmParameterMetadata,
  SimSsmParameterOutput,
} from "./parameter.command.js";

/**
 * A filter on a parameter query, which sim SSM refuses rather than applies.
 */
export interface SimSsmParameterFilter {
  readonly Key?: string | undefined;
  readonly Option?: string | undefined;
  readonly Values?: readonly string[] | undefined;
}

/**
 * Minimal structural sim SSM GetParameter command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/GetParameterCommand/
 */
export interface SimGetParameterCommand {
  readonly input: SimGetParameterCommandInput;
}

export interface SimGetParameterCommandInput {
  readonly Name?: string | undefined;
  readonly WithDecryption?: boolean | undefined;
}

export interface SimGetParameterCommandOutput {
  readonly Parameter?: SimSsmParameterOutput | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SSM GetParameters command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/GetParametersCommand/
 */
export interface SimGetParametersCommand {
  readonly input: SimGetParametersCommandInput;
}

export interface SimGetParametersCommandInput {
  readonly Names?: readonly string[] | undefined;
  readonly WithDecryption?: boolean | undefined;
}

export interface SimGetParametersCommandOutput {
  readonly Parameters?: readonly SimSsmParameterOutput[] | undefined;
  readonly InvalidParameters?: readonly string[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SSM GetParametersByPath command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/GetParametersByPathCommand/
 */
export interface SimGetParametersByPathCommand {
  readonly input: SimGetParametersByPathCommandInput;
}

export interface SimGetParametersByPathCommandInput {
  readonly Path?: string | undefined;
  readonly Recursive?: boolean | undefined;
  readonly ParameterFilters?: readonly SimSsmParameterFilter[] | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
  readonly WithDecryption?: boolean | undefined;
}

export interface SimGetParametersByPathCommandOutput {
  readonly Parameters?: readonly SimSsmParameterOutput[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SSM DescribeParameters command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/command/DescribeParametersCommand/
 */
export interface SimDescribeParametersCommand {
  readonly input?: SimDescribeParametersCommandInput | undefined;
}

export interface SimDescribeParametersCommandInput {
  readonly Filters?: readonly SimSsmParameterFilter[] | undefined;
  readonly ParameterFilters?: readonly SimSsmParameterFilter[] | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
  readonly Shared?: boolean | undefined;
}

export interface SimDescribeParametersCommandOutput {
  readonly Parameters?: readonly SimSsmParameterMetadata[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
