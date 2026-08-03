import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateAuthorizerCommandInput } from "../../command/authorizer/authorizer.command.js";
import type { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

/**
 * The half of a CreateAuthorizer input a Lambda `REQUEST` authorizer is
 * configured by.
 */
type SimCfnHttpApiRequestAuthorizerInput = Pick<
  SimCreateAuthorizerCommandInput,
  | "AuthorizerUri"
  | "AuthorizerPayloadFormatVersion"
  | "EnableSimpleResponses"
  | "AuthorizerResultTtlInSeconds"
>;

interface SimCfnHttpApiRequestAuthorizerPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
  readonly propertyParser: SimCfnApiGatewayV2PropertyParser;
}

/**
 * Reads the properties only a Lambda `REQUEST` authorizer Resource carries.
 *
 * `AuthorizerUri` arrives as the wrapped
 * `arn:aws:apigateway:<region>:lambda:path/...` form CDK builds with
 * `Fn::Join`, which is one of the two forms CreateAuthorizer takes. Nothing is
 * checked here: what a `REQUEST` authorizer requires is stated by
 * CreateAuthorizer, so a template is held to the same rules an SDK caller is,
 * and a JWT authorizer declaring one of these is refused the same way too.
 */
export class SimCfnHttpApiRequestAuthorizerProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser: SimCfnApiGatewayV2PropertyParser;

  constructor(properties: SimCfnHttpApiRequestAuthorizerPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The `REQUEST` half of the CreateAuthorizer input this Resource asks for.
   */
  read(): SimCfnHttpApiRequestAuthorizerInput {
    return {
      AuthorizerUri: this.propertyParser.optionalString(
        this.resource,
        this.properties["AuthorizerUri"],
        "AuthorizerUri",
      ),
      AuthorizerPayloadFormatVersion: this.propertyParser.optionalString(
        this.resource,
        this.properties["AuthorizerPayloadFormatVersion"],
        "AuthorizerPayloadFormatVersion",
      ),
      EnableSimpleResponses: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["EnableSimpleResponses"],
        "EnableSimpleResponses",
      ),
      AuthorizerResultTtlInSeconds: this.propertyParser.optionalNumber(
        this.resource,
        this.properties["AuthorizerResultTtlInSeconds"],
        "AuthorizerResultTtlInSeconds",
      ),
    };
  }
}
