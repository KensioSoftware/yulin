import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateAuthorizerCommandInput } from "../../command/authorizer/authorizer.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";
import { SimCfnHttpApiJwtConfigurationProperties } from "./sim-cfn-http-api-jwt-configuration-properties.js";
import { SimCfnHttpApiRequestAuthorizerProperties } from "./sim-cfn-http-api-request-authorizer-properties.js";

/**
 * The AWS::ApiGatewayV2::Authorizer properties this simulation deploys.
 *
 * Both kinds of authorizer are here, and each kind's own properties are
 * refused on the other by CreateAuthorizer rather than by this list, which is
 * per Resource type. `AuthorizerCredentialsArn` is left out: it names an IAM
 * Role for API Gateway to assume instead of relying on the function's resource
 * policy, and nothing here assumes one.
 */
const simulatedProperties = [
  "ApiId",
  "Name",
  "AuthorizerType",
  "IdentitySource",
  "JwtConfiguration",
  "AuthorizerUri",
  "AuthorizerPayloadFormatVersion",
  "EnableSimpleResponses",
  "AuthorizerResultTtlInSeconds",
];

interface SimCfnHttpApiAuthorizerPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGatewayV2::Authorizer CloudFormation properties into the
 * CreateAuthorizer input the authorizer creator needs.
 */
export class SimCfnHttpApiAuthorizerProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayV2PropertyParser({
    resourceType: "AWS::ApiGatewayV2::Authorizer",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnHttpApiAuthorizerPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API this authorizer belongs to, which a template reaches with a `Ref`
   * on its AWS::ApiGatewayV2::Api.
   */
  apiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["ApiId"],
      "ApiId",
    );
  }

  /**
   * The CreateAuthorizer input this Resource asks for.
   *
   * Everything but the shape of each value is passed through, so what an
   * authorizer requires is refused by CreateAuthorizer with the reason it
   * refuses it. That covers a JWT authorizer carrying a `REQUEST` property, a
   * `REQUEST` authorizer carrying a `JwtConfiguration`, and an
   * `AuthorizerPayloadFormatVersion` of `1.0`.
   */
  createAuthorizerInput(): SimCreateAuthorizerCommandInput {
    return {
      ApiId: this.apiId(),
      Name: this.propertyParser.optionalString(
        this.resource,
        this.properties["Name"],
        "Name",
      ),
      AuthorizerType: this.propertyParser.optionalString(
        this.resource,
        this.properties["AuthorizerType"],
        "AuthorizerType",
      ),
      IdentitySource: this.propertyParser.optionalStringList(
        this.resource,
        this.properties["IdentitySource"],
        "IdentitySource",
      ),
      JwtConfiguration: this.jwtConfiguration(),
      ...this.requestProperties(),
    };
  }

  private jwtConfiguration(): SimCreateAuthorizerCommandInput["JwtConfiguration"] {
    return new SimCfnHttpApiJwtConfigurationProperties({
      resource: this.resource,
      properties: this.properties,
      propertyParser: this.propertyParser,
    }).read();
  }

  private requestProperties(): SimCreateAuthorizerCommandInput {
    return new SimCfnHttpApiRequestAuthorizerProperties({
      resource: this.resource,
      properties: this.properties,
      propertyParser: this.propertyParser,
    }).read();
  }
}
