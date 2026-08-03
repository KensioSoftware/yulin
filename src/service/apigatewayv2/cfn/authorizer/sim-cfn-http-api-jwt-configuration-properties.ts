import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateAuthorizerCommandInput } from "../../command/authorizer/authorizer.command.js";
import type { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

interface SimCfnHttpApiJwtConfigurationPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
  readonly propertyParser: SimCfnApiGatewayV2PropertyParser;
}

/**
 * Reads the JwtConfiguration of an AWS::ApiGatewayV2::Authorizer Resource.
 *
 * The issuer arrives as the string CDK builds from
 * `Fn::GetAtt <UserPool>.ProviderURL`, which is the same string the pool's
 * tokens name as their issuer. Nothing is checked here: what an authorizer
 * requires is stated by CreateAuthorizer, so a template is held to the same
 * rules an SDK caller is.
 */
export class SimCfnHttpApiJwtConfigurationProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser: SimCfnApiGatewayV2PropertyParser;

  constructor(properties: SimCfnHttpApiJwtConfigurationPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The JwtConfiguration this Resource declares, if it declares one.
   */
  read(): SimCreateAuthorizerCommandInput["JwtConfiguration"] {
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
