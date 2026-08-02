import { SimHttpApiIntegration } from "../../../../apigatewayv2/api/integration/sim-http-api-integration.js";
import { SimHttpApiRoute } from "../../../../apigatewayv2/api/route/sim-http-api-route.js";
import { SimHttpApi } from "../../../../apigatewayv2/api/sim-http-api.js";
import { SimHttpApiStage } from "../../../../apigatewayv2/api/stage/sim-http-api-stage.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimHttpApiCfn } from "./sim-http-api-cfn.js";
import { SimHttpApiIntegrationCfn } from "./sim-http-api-integration-cfn.js";
import { SimHttpApiRouteCfn } from "./sim-http-api-route-cfn.js";
import { SimHttpApiStageCfn } from "./sim-http-api-stage-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated API Gateway v2
 * Resource.
 */
export function apiGatewayV2ValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::ApiGatewayV2::Api" &&
    properties.simResource instanceof SimHttpApi
  ) {
    return new SimHttpApiCfn({ httpApi: properties.simResource });
  }

  if (
    properties.type === "AWS::ApiGatewayV2::Integration" &&
    properties.simResource instanceof SimHttpApiIntegration
  ) {
    return new SimHttpApiIntegrationCfn({
      integration: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::ApiGatewayV2::Route" &&
    properties.simResource instanceof SimHttpApiRoute
  ) {
    return new SimHttpApiRouteCfn({ route: properties.simResource });
  }

  if (
    properties.type === "AWS::ApiGatewayV2::Stage" &&
    properties.simResource instanceof SimHttpApiStage
  ) {
    return new SimHttpApiStageCfn({ stage: properties.simResource });
  }

  return undefined;
}
