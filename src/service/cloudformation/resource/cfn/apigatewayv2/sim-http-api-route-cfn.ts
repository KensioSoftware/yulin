import type { SimHttpApiRoute } from "../../../../apigatewayv2/api/route/sim-http-api-route.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimHttpApiRouteCfnProperties {
  readonly route: SimHttpApiRoute;
}

/**
 * CloudFormation-facing values for a simulated HTTP API route.
 */
export class SimHttpApiRouteCfn implements SimCfnResourceValueAdapter {
  private readonly route: SimHttpApiRoute;

  constructor(properties: SimHttpApiRouteCfnProperties) {
    this.route = properties.route;
  }

  /**
   * AWS::ApiGatewayV2::Route Ref returns the route id, which is how a route is
   * addressed once it exists. The route key is what identifies it to the API.
   */
  refValue(): SimCfnTemplateValue {
    return this.route.routeId;
  }

  /**
   * AWS::ApiGatewayV2::Route publishes RouteId.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "RouteId") {
      return this.route.routeId;
    }

    throw new Error(
      `Unsupported AWS::ApiGatewayV2::Route attribute ${attributeName}`,
    );
  }
}
