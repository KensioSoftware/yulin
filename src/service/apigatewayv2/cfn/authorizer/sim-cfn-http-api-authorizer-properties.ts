import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateAuthorizerCommandInput } from "../../command/authorizer/authorizer.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";
import { SimCfnHttpApiJwtConfigurationProperties } from "./sim-cfn-http-api-jwt-configuration-properties.js";

/**
 * The AWS::ApiGatewayV2::Authorizer properties this simulation deploys.
 *
 * Everything a Lambda `REQUEST` authorizer is configured with is left out, so
 * a template carrying one is refused by name rather than deploying an
 * authorizer that would decide differently here. `CreateAuthorizer` does
 * create a `REQUEST` authorizer for an SDK caller; declaring one in a template
 * is the part that is not simulated yet.
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
   * Everything but the type is passed through, so what an authorizer requires
   * is refused by CreateAuthorizer with the reason it refuses it.
   */
  createAuthorizerInput(): SimCreateAuthorizerCommandInput {
    return {
      ApiId: this.apiId(),
      Name: this.propertyParser.optionalString(
        this.resource,
        this.properties["Name"],
        "Name",
      ),
      AuthorizerType: this.authorizerType(),
      IdentitySource: this.propertyParser.optionalStringList(
        this.resource,
        this.properties["IdentitySource"],
        "IdentitySource",
      ),
      JwtConfiguration: this.jwtConfiguration(),
    };
  }

  /**
   * The type this Resource declares, refusing `REQUEST` by name.
   *
   * A `REQUEST` authorizer needs the properties naming its function, and those
   * are not deployed from a template yet, so a Resource declaring one would
   * fail further down for a reason that reads as a missing property rather
   * than as the feature it is.
   */
  private authorizerType(): string | undefined {
    const authorizerType = this.propertyParser.optionalString(
      this.resource,
      this.properties["AuthorizerType"],
      "AuthorizerType",
    );

    if (authorizerType === "REQUEST") {
      throw new Error(
        `AWS::ApiGatewayV2::Authorizer ${this.resource.logicalId} declares a ` +
          `Lambda REQUEST authorizer, which is not deployed from a template ` +
          `yet. Create it with CreateAuthorizer instead.`,
      );
    }

    return authorizerType;
  }

  private jwtConfiguration(): SimCreateAuthorizerCommandInput["JwtConfiguration"] {
    return new SimCfnHttpApiJwtConfigurationProperties({
      resource: this.resource,
      properties: this.properties,
      propertyParser: this.propertyParser,
    }).read();
  }
}
