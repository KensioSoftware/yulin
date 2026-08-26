import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimHttpApiDomainNameConfiguration,
  SimHttpApiDomainNameView,
} from "../../domain/sim-http-api-domain-name.js";

/**
 * Minimal structural sim API Gateway v2 CreateDomainName command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/CreateDomainNameCommand/
 */
export interface SimCreateDomainNameCommand {
  readonly input: SimCreateDomainNameCommandInput;
}

export interface SimCreateDomainNameCommandInput {
  readonly DomainName?: string | undefined;
  readonly DomainNameConfigurations?:
    | readonly SimHttpApiDomainNameConfiguration[]
    | undefined;
}

export interface SimCreateDomainNameCommandOutput extends SimHttpApiDomainNameView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetDomainName command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetDomainNameCommand/
 */
export interface SimGetDomainNameCommand {
  readonly input: SimGetDomainNameCommandInput;
}

export interface SimGetDomainNameCommandInput {
  readonly DomainName?: string | undefined;
}

export interface SimGetDomainNameCommandOutput extends SimHttpApiDomainNameView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetDomainNames command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetDomainNamesCommand/
 */
export interface SimGetDomainNamesCommand {
  readonly input: SimGetDomainNamesCommandInput;
}

export interface SimGetDomainNamesCommandInput {
  readonly MaxResults?: string | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimGetDomainNamesCommandOutput {
  readonly Items: readonly SimHttpApiDomainNameView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 DeleteDomainName command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/DeleteDomainNameCommand/
 */
export interface SimDeleteDomainNameCommand {
  readonly input: SimDeleteDomainNameCommandInput;
}

export interface SimDeleteDomainNameCommandInput {
  readonly DomainName?: string | undefined;
}

export interface SimDeleteDomainNameCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
