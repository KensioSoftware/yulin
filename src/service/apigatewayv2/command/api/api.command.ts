import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimHttpApiView } from "../../api/sim-http-api-view.js";

/**
 * Minimal structural sim API Gateway v2 CreateApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/CreateApiCommand/
 */
export interface SimCreateApiCommand {
  readonly input: SimCreateApiCommandInput;
}

export interface SimCreateApiCommandInput {
  readonly Name?: string | undefined;
  readonly ProtocolType?: string | undefined;
  readonly Description?: string | undefined;
  readonly DisableExecuteApiEndpoint?: boolean | undefined;
}

export interface SimCreateApiCommandOutput extends SimHttpApiView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetApiCommand/
 */
export interface SimGetApiCommand {
  readonly input: SimGetApiCommandInput;
}

export interface SimGetApiCommandInput {
  readonly ApiId?: string | undefined;
}

export interface SimGetApiCommandOutput extends SimHttpApiView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetApis command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetApisCommand/
 */
export interface SimGetApisCommand {
  readonly input: SimGetApisCommandInput;
}

export interface SimGetApisCommandInput {
  readonly MaxResults?: string | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimGetApisCommandOutput {
  readonly Items: readonly SimHttpApiView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 DeleteApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/DeleteApiCommand/
 */
export interface SimDeleteApiCommand {
  readonly input: SimDeleteApiCommandInput;
}

export interface SimDeleteApiCommandInput {
  readonly ApiId?: string | undefined;
}

export interface SimDeleteApiCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
