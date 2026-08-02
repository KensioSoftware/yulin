import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiRoute } from "../../api/route/sim-http-api-route.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import { SimCfnHttpApiRouteProperties } from "./sim-cfn-http-api-route-properties.js";
import { SimCfnHttpApiSkippedAuthorizer } from "./sim-cfn-http-api-skipped-authorizer.js";

interface SimCfnHttpApiRouteCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Creates simulated routes from AWS::ApiGatewayV2::Route Resources.
 *
 * The route goes through the ordinary CreateRoute command, so a malformed
 * route key, a route key the API already has, and a target naming no
 * integration are all refused here with the reason the command gives.
 */
export class SimCfnHttpApiRouteCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;
  private readonly skippedAuthorizer = new SimCfnHttpApiSkippedAuthorizer();

  constructor(properties: SimCfnHttpApiRouteCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
  }

  /**
   * Create a route from an AWS::ApiGatewayV2::Route Resource.
   *
   * The skipped-authorizer check comes first, because it is the one refusal
   * that can explain itself: an `AuthorizerId` refused only by the allow-list
   * would not say that the authorizer it names was skipped.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<SimHttpApiRoute> {
    this.skippedAuthorizer.refuse(resource, properties, context.resources);

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
