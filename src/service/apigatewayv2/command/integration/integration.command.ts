import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimHttpApiIntegrationView } from "../../api/integration/sim-http-api-integration.js";

/**
 * Minimal structural sim API Gateway v2 CreateIntegration command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/CreateIntegrationCommand/
 */
export interface SimCreateIntegrationCommand {
  readonly input: SimCreateIntegrationCommandInput;
}

export interface SimCreateIntegrationCommandInput {
  readonly ApiId?: string | undefined;
  readonly IntegrationType?: string | undefined;
  readonly IntegrationUri?: string | undefined;
  readonly PayloadFormatVersion?: string | undefined;
  readonly Description?: string | undefined;
}

export interface SimCreateIntegrationCommandOutput extends SimHttpApiIntegrationView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetIntegrations command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetIntegrationsCommand/
 */
export interface SimGetIntegrationsCommand {
  readonly input: SimGetIntegrationsCommandInput;
}

export interface SimGetIntegrationsCommandInput {
  readonly ApiId?: string | undefined;
  readonly MaxResults?: string | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimGetIntegrationsCommandOutput {
  readonly Items: readonly SimHttpApiIntegrationView[];
  readonly $metadata: SimResponseMetadata;
}
