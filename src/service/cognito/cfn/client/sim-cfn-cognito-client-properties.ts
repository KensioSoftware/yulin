import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateUserPoolClientCommandInput } from "../../command/client/user-pool-client.command.js";
import { SimCfnCognitoGeneratedName } from "../sim-cfn-cognito-generated-name.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoTokenValidityUnits } from "./sim-cfn-cognito-token-validity-units.js";

/**
 * The AWS::Cognito::UserPoolClient properties this simulation deploys.
 *
 * The OAuth and managed login properties that turn the hosted UI on are
 * absent, because it is not simulated at all, so a client deployed with them
 * would offer flows nothing here can run.
 *
 * The last two are the ones that turn it off, which is what a CDK client
 * created with `disableOAuth` emits. CreateUserPoolClient accepts an
 * `AllowedOAuthFlowsUserPoolClient` of `false`, and a
 * `SupportedIdentityProviders` naming only `COGNITO`, because both ask for
 * the pool's own users and nothing else. Any other value is refused there.
 */
const simulatedProperties = [
  "UserPoolId",
  "ClientName",
  "GenerateSecret",
  "ExplicitAuthFlows",
  "PreventUserExistenceErrors",
  "AccessTokenValidity",
  "IdTokenValidity",
  "RefreshTokenValidity",
  "TokenValidityUnits",
  "AllowedOAuthFlowsUserPoolClient",
  "SupportedIdentityProviders",
];

interface SimCfnCognitoClientPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Cognito::UserPoolClient CloudFormation properties into the
 * CreateUserPoolClient input the client creator needs.
 */
export class SimCfnCognitoClientProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnCognitoPropertyParser({
    resourceType: "AWS::Cognito::UserPoolClient",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnCognitoClientPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The pool this client belongs to, which a template reaches with a `Ref` on
   * its AWS::Cognito::UserPool.
   */
  userPoolId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["UserPoolId"],
      "UserPoolId",
    );
  }

  /**
   * The CreateUserPoolClient input this Resource asks for.
   */
  createUserPoolClientInput(): SimCreateUserPoolClientCommandInput {
    return {
      UserPoolId: this.userPoolId(),
      ClientName: this.clientName(),
      GenerateSecret: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["GenerateSecret"],
        "GenerateSecret",
      ),
      ExplicitAuthFlows: this.propertyParser.optionalStringArray(
        this.resource,
        this.properties["ExplicitAuthFlows"],
        "ExplicitAuthFlows",
      ),
      PreventUserExistenceErrors: this.string(
        this.properties["PreventUserExistenceErrors"],
        "PreventUserExistenceErrors",
      ),
      AccessTokenValidity: this.number(
        this.properties["AccessTokenValidity"],
        "AccessTokenValidity",
      ),
      IdTokenValidity: this.number(
        this.properties["IdTokenValidity"],
        "IdTokenValidity",
      ),
      RefreshTokenValidity: this.number(
        this.properties["RefreshTokenValidity"],
        "RefreshTokenValidity",
      ),
      TokenValidityUnits: new SimCfnCognitoTokenValidityUnits({
        resource: this.resource,
        propertyParser: this.propertyParser,
      }).parse(this.properties["TokenValidityUnits"]),
      AllowedOAuthFlowsUserPoolClient: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["AllowedOAuthFlowsUserPoolClient"],
        "AllowedOAuthFlowsUserPoolClient",
      ),
      SupportedIdentityProviders: this.propertyParser.optionalStringArray(
        this.resource,
        this.properties["SupportedIdentityProviders"],
        "SupportedIdentityProviders",
      ),
    };
  }

  /**
   * The client's name, generated from the stack and the logical ID when the
   * template names none, as real CloudFormation generates one.
   */
  private clientName(): string {
    const named = this.string(this.properties["ClientName"], "ClientName");

    if (named !== undefined) {
      return named;
    }

    return new SimCfnCognitoGeneratedName({
      stackName: this.resource.stackName,
      logicalId: this.resource.logicalId,
    }).value;
  }

  private string(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string | undefined {
    return this.propertyParser.optionalString(this.resource, value, label);
  }

  private number(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): number | undefined {
    return this.propertyParser.optionalNumber(this.resource, value, label);
  }
}
