import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateRouteCommandInput } from "../../command/route/route.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

/**
 * The AWS::ApiGatewayV2::Route properties this simulation deploys.
 */
const simulatedProperties = [
  "ApiId",
  "RouteKey",
  "Target",
  "AuthorizationType",
  "AuthorizerId",
  "AuthorizationScopes",
];

interface SimCfnHttpApiRoutePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGatewayV2::Route CloudFormation properties into the CreateRoute
 * input the route creator needs.
 */
export class SimCfnHttpApiRouteProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayV2PropertyParser({
    resourceType: "AWS::ApiGatewayV2::Route",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnHttpApiRoutePropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API this route belongs to, which a template reaches with a `Ref` on
   * its AWS::ApiGatewayV2::Api.
   */
  apiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["ApiId"],
      "ApiId",
    );
  }

  /**
   * The CreateRoute input this Resource asks for.
   *
   * The target arrives as the `integrations/<integration-id>` string CDK
   * builds with `Fn::Join`, which is also the only form the command takes, so
   * it is passed straight through. `AuthorizationType` and `AuthorizerId` are
   * passed through too, so an authorization type that is not simulated, and an
   * authorizer id naming nothing on the API, are both refused by CreateRoute
   * with the reason it refuses them.
   */
  createRouteInput(): SimCreateRouteCommandInput {
    return {
      ApiId: this.apiId(),
      RouteKey: this.propertyParser.optionalString(
        this.resource,
        this.properties["RouteKey"],
        "RouteKey",
      ),
      Target: this.propertyParser.optionalString(
        this.resource,
        this.properties["Target"],
        "Target",
      ),
      AuthorizationType: this.propertyParser.optionalString(
        this.resource,
        this.properties["AuthorizationType"],
        "AuthorizationType",
      ),
      AuthorizerId: this.propertyParser.optionalString(
        this.resource,
        this.properties["AuthorizerId"],
        "AuthorizerId",
      ),
      AuthorizationScopes: this.propertyParser.optionalStringList(
        this.resource,
        this.properties["AuthorizationScopes"],
        "AuthorizationScopes",
      ),
    };
  }
}
