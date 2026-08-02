import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiRoute } from "../../api/route/sim-http-api-route.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import { SimCfnHttpApiRouteProperties } from "./sim-cfn-http-api-route-properties.js";

interface SimCfnHttpApiRouteCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Creates simulated routes from AWS::ApiGatewayV2::Route Resources.
 *
 * The route goes through the ordinary CreateRoute command, so a malformed
 * route key, a route key the API already has, a target naming no integration
 * and an `AuthorizerId` naming no authorizer of the API are all refused here
 * with the reason the command gives.
 *
 * That last one is what stops a `Ref` to a Resource this simulation skipped
 * deploying a route: a skipped Resource matches no value adapter, so the `Ref`
 * resolves to its own logical ID, and no authorizer has that id.
 */
export class SimCfnHttpApiRouteCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;

  constructor(properties: SimCfnHttpApiRouteCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
  }

  /**
   * Create a route from an AWS::ApiGatewayV2::Route Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimHttpApiRoute> {
    const routeProperties = new SimCfnHttpApiRouteProperties({
      resource,
      properties,
    });
    const apiId = routeProperties.apiId();

    const created = await this.apiGatewayV2.createRoute({
      input: routeProperties.createRouteInput(),
    });

    const route = this.apiGatewayV2
      .findApi(apiId)
      ?.routes.find(created.RouteId);
    assertDefined(
      route,
      `sim HTTP API route ${created.RouteId} after CloudFormation creation`,
    );

    return route;
  }
}
