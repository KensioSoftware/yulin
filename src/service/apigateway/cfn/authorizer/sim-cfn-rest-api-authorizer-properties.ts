import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateAuthorizerCommandInput } from "../../command/authorizer/authorizer.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

/**
 * The AWS::ApiGateway::Authorizer properties this simulation deploys.
 *
 * `AuthorizerResultTtlInSeconds`, `ProviderARNs`, `AuthorizerCredentials`,
 * `IdentityValidationExpression` and `AuthType` are left out, so a template
 * carrying one has it recorded against the Resource. Each belongs to a piece
 * of work outside this one, and what an authorizer of a given `Type` requires
 * is stated by `CreateAuthorizer` rather than here.
 */
const simulatedProperties = [
  "RestApiId",
  "Name",
  "Type",
  "AuthorizerUri",
  "IdentitySource",
];

interface SimCfnRestApiAuthorizerPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGateway::Authorizer CloudFormation properties into the
 * CreateAuthorizer input the authorizer creator needs.
 */
export class SimCfnRestApiAuthorizerProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::Authorizer",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnRestApiAuthorizerPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API this authorizer belongs to, which a template reaches with a `Ref`
   * on its AWS::ApiGateway::RestApi.
   */
  restApiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["RestApiId"],
      "RestApiId",
    );
  }

  /**
   * The CreateAuthorizer input this Resource asks for.
   *
   * Everything but the shape of each value is passed through, so a
   * `COGNITO_USER_POOLS` authorizer, one naming no function and one whose
   * identity source names somewhere this simulation reads nothing from are all
   * refused by CreateAuthorizer with the reason it refuses them.
   *
   * `IdentitySource` is one comma-separated string, which is how a REST API
   * writes a list where an HTTP API takes one.
   *
   * `AuthorizerUri` arrives as the wrapped
   * `arn:aws:apigateway:<region>:lambda:path/...` form CDK builds with
   * `Fn::Join`, which is one of the two forms CreateAuthorizer takes.
   */
  createAuthorizerInput(): SimCreateAuthorizerCommandInput {
    return {
      restApiId: this.restApiId(),
      name: this.propertyParser.optionalString(
        this.resource,
        this.properties["Name"],
        "Name",
      ),
      type: this.propertyParser.optionalString(
        this.resource,
        this.properties["Type"],
        "Type",
      ),
      authorizerUri: this.propertyParser.optionalString(
        this.resource,
        this.properties["AuthorizerUri"],
        "AuthorizerUri",
      ),
      identitySource: this.propertyParser.optionalString(
        this.resource,
        this.properties["IdentitySource"],
        "IdentitySource",
      ),
    };
  }
}
