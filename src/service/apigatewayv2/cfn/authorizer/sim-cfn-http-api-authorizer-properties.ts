import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateAuthorizerCommandInput } from "../../command/authorizer/authorizer.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

/**
 * The AWS::ApiGatewayV2::Authorizer properties this simulation deploys.
 *
 * Everything a Lambda `REQUEST` authorizer is configured with is left out, so
 * a template carrying one is refused by name rather than deploying an
 * authorizer that would decide differently here.
 */
const simulatedProperties = [
  "ApiId",
  "Name",
  "AuthorizerType",
  "IdentitySource",
  "JwtConfiguration",
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

    this.propertyParser.requireOnlySimulated(this.resource, this.properties);
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
   * `AuthorizerType` is passed through, so a type that is not simulated is
   * refused by CreateAuthorizer with the reason it refuses it. The issuer
   * arrives as the string CDK builds from `Fn::GetAtt <UserPool>.ProviderURL`,
   * which is the same string the pool's tokens name as their issuer.
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
    };
  }

  private jwtConfiguration(): SimCreateAuthorizerCommandInput["JwtConfiguration"] {
    const configuration = this.propertyParser.optionalRecord(
      this.resource,
      this.properties["JwtConfiguration"],
      "JwtConfiguration",
    );

    if (configuration === undefined) {
      return undefined;
    }

    return {
      Issuer: this.propertyParser.optionalString(
        this.resource,
        configuration["Issuer"],
        "JwtConfiguration.Issuer",
      ),
      Audience: this.propertyParser.optionalStringList(
        this.resource,
        configuration["Audience"],
        "JwtConfiguration.Audience",
      ),
    };
  }
}
