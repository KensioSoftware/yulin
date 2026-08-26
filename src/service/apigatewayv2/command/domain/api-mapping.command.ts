import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimApiMappingView } from "../../domain/sim-api-mapping.js";

/**
 * Minimal structural sim API Gateway v2 CreateApiMapping command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/CreateApiMappingCommand/
 */
export interface SimCreateApiMappingCommand {
  readonly input: SimCreateApiMappingCommandInput;
}

export interface SimCreateApiMappingCommandInput {
  readonly DomainName?: string | undefined;
  readonly ApiId?: string | undefined;
  readonly Stage?: string | undefined;
  readonly ApiMappingKey?: string | undefined;
}

export interface SimCreateApiMappingCommandOutput extends SimApiMappingView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetApiMapping command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetApiMappingCommand/
 */
export interface SimGetApiMappingCommand {
  readonly input: SimGetApiMappingCommandInput;
}

export interface SimGetApiMappingCommandInput {
  readonly DomainName?: string | undefined;
  readonly ApiMappingId?: string | undefined;
}

export interface SimGetApiMappingCommandOutput extends SimApiMappingView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetApiMappings command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetApiMappingsCommand/
 */
export interface SimGetApiMappingsCommand {
  readonly input: SimGetApiMappingsCommandInput;
}

export interface SimGetApiMappingsCommandInput {
  readonly DomainName?: string | undefined;
  readonly MaxResults?: string | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimGetApiMappingsCommandOutput {
  readonly Items: readonly SimApiMappingView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 DeleteApiMapping command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/DeleteApiMappingCommand/
 */
export interface SimDeleteApiMappingCommand {
  readonly input: SimDeleteApiMappingCommandInput;
}

export interface SimDeleteApiMappingCommandInput {
  readonly DomainName?: string | undefined;
  readonly ApiMappingId?: string | undefined;
}

export interface SimDeleteApiMappingCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
