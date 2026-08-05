import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimHttpApiRouteView } from "../../api/route/sim-http-api-route-view.js";

/**
 * Minimal structural sim API Gateway v2 CreateRoute command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/CreateRouteCommand/
 */
export interface SimCreateRouteCommand {
  readonly input: SimCreateRouteCommandInput;
}

export interface SimCreateRouteCommandInput {
  readonly ApiId?: string | undefined;
  readonly RouteKey?: string | undefined;
  readonly Target?: string | undefined;
  readonly AuthorizationType?: string | undefined;
  readonly AuthorizerId?: string | undefined;
  readonly AuthorizationScopes?: readonly string[] | undefined;
}

export interface SimCreateRouteCommandOutput extends SimHttpApiRouteView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetRoutes command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetRoutesCommand/
 */
export interface SimGetRoutesCommand {
  readonly input: SimGetRoutesCommandInput;
}

export interface SimGetRoutesCommandInput {
  readonly ApiId?: string | undefined;
  readonly MaxResults?: string | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimGetRoutesCommandOutput {
  readonly Items: readonly SimHttpApiRouteView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 DeleteRoute command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/DeleteRouteCommand/
 */
export interface SimDeleteRouteCommand {
  readonly input: SimDeleteRouteCommandInput;
}

export interface SimDeleteRouteCommandInput {
  readonly ApiId?: string | undefined;
  readonly RouteId?: string | undefined;
}

export interface SimDeleteRouteCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
