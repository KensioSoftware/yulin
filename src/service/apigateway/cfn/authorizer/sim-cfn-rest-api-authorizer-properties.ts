import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateAuthorizerCommandInput } from "../../command/authorizer/authorizer.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

/**
 * The AWS::ApiGateway::Authorizer properties this simulation deploys.
 *
 * `AuthorizerResultTtlInSeconds`, `AuthorizerCredentials`,
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
  "ProviderARNs",
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
   * Everything but the shape of each value is passed through, so an
   * authorizer naming no function or no user pool, and one whose identity
   * source names somewhere this simulation reads nothing from, are refused by
   * CreateAuthorizer with the reason it refuses them.
   *
   * `IdentitySource` is one comma-separated string, which is how a REST API
   * writes a list where an HTTP API takes one.
>>>>>>> d71bc9d5 (feat: gate a REST API method with a user pool)
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
      providerARNs: this.propertyParser.optionalStringList(
        this.resource,
        this.properties["ProviderARNs"],
        "ProviderARNs",
      ),
      identitySource: this.propertyParser.optionalString(
        this.resource,
        this.properties["IdentitySource"],
        "IdentitySource",
      ),
    };
  }
}
