import { SimHttpApiAuthorizer } from "../../../../apigatewayv2/api/authorizer/sim-http-api-authorizer.js";
import { SimHttpApiIntegration } from "../../../../apigatewayv2/api/integration/sim-http-api-integration.js";
import { SimHttpApiRoute } from "../../../../apigatewayv2/api/route/sim-http-api-route.js";
import { SimHttpApi } from "../../../../apigatewayv2/api/sim-http-api.js";
import { SimApiMapping } from "../../../../apigatewayv2/domain/sim-api-mapping.js";
import { SimHttpApiDomainName } from "../../../../apigatewayv2/domain/sim-http-api-domain-name.js";
import { SimHttpApiStage } from "../../../../apigatewayv2/api/stage/sim-http-api-stage.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimHttpApiAuthorizerCfn } from "./sim-http-api-authorizer-cfn.js";
import { SimHttpApiCfn } from "./sim-http-api-cfn.js";
import { SimHttpApiIntegrationCfn } from "./sim-http-api-integration-cfn.js";
import { SimHttpApiRouteCfn } from "./sim-http-api-route-cfn.js";
import { SimApiMappingCfn } from "./sim-api-mapping-cfn.js";
import { SimHttpApiDomainNameCfn } from "./sim-http-api-domain-name-cfn.js";
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
    properties.type === "AWS::ApiGatewayV2::Authorizer" &&
    properties.simResource instanceof SimHttpApiAuthorizer
  ) {
    return new SimHttpApiAuthorizerCfn({ authorizer: properties.simResource });
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

  if (
    properties.type === "AWS::ApiGatewayV2::DomainName" &&
    properties.simResource instanceof SimHttpApiDomainName
  ) {
    return new SimHttpApiDomainNameCfn({ domain: properties.simResource });
  }

  if (
    properties.type === "AWS::ApiGatewayV2::ApiMapping" &&
    properties.simResource instanceof SimApiMapping
  ) {
    return new SimApiMappingCfn({ mapping: properties.simResource });
  }

  return undefined;
}
