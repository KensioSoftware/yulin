import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateUserPoolClientCommandInput } from "../../command/client/user-pool-client.command.js";
import { simCognitoUnsimulatedClientOptions } from "../../command/client/sim-cognito-unsimulated-client-options.js";
import { SimCfnCognitoGeneratedName } from "../sim-cfn-cognito-generated-name.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoRefreshTokenRotation } from "./sim-cfn-cognito-refresh-token-rotation.js";
import { SimCfnCognitoTokenValidityUnits } from "./sim-cfn-cognito-token-validity-units.js";

/**
 * The AWS::Cognito::UserPoolClient properties this simulation deploys.
 *
 * The OAuth properties are among them, because a client is what an authorize
 * request at the pool's domain is checked against: which grant it may ask
 * for, which scopes, which URL it may be sent back to, and which identity
 * provider it may sign a user in through.
 *
 * `RefreshTokenRotation` is among them, because it decides which operation
 * renews a session: a client deployed with rotation is renewed with
 * `GetTokensFromRefreshToken` rather than `REFRESH_TOKEN_AUTH`.
 *
 * `AuthSessionValidity` is among them, because it decides how long a user
 * answering a challenge has before its session runs out.
 *
 * The managed login branding properties are not, because managed login is a
 * set of web pages rather than anything this simulation answers.
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
  "AuthSessionValidity",
  "RefreshTokenRotation",
  "TokenValidityUnits",
  "AllowedOAuthFlows",
  "AllowedOAuthFlowsUserPoolClient",
  "AllowedOAuthScopes",
  "CallbackURLs",
  "LogoutURLs",
  "DefaultRedirectURI",
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
    refused: simCognitoUnsimulatedClientOptions,
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
      AuthSessionValidity: this.number(
        this.properties["AuthSessionValidity"],
        "AuthSessionValidity",
      ),
      RefreshTokenRotation: new SimCfnCognitoRefreshTokenRotation({
        resource: this.resource,
        propertyParser: this.propertyParser,
      }).parse(this.properties["RefreshTokenRotation"]),
      TokenValidityUnits: new SimCfnCognitoTokenValidityUnits({
        resource: this.resource,
        propertyParser: this.propertyParser,
      }).parse(this.properties["TokenValidityUnits"]),
      AllowedOAuthFlowsUserPoolClient: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["AllowedOAuthFlowsUserPoolClient"],
        "AllowedOAuthFlowsUserPoolClient",
      ),
      AllowedOAuthFlows: this.stringArray(
        this.properties["AllowedOAuthFlows"],
        "AllowedOAuthFlows",
      ),
      AllowedOAuthScopes: this.stringArray(
        this.properties["AllowedOAuthScopes"],
        "AllowedOAuthScopes",
      ),
      CallbackURLs: this.stringArray(
        this.properties["CallbackURLs"],
        "CallbackURLs",
      ),
      LogoutURLs: this.stringArray(this.properties["LogoutURLs"], "LogoutURLs"),
      DefaultRedirectURI: this.string(
        this.properties["DefaultRedirectURI"],
        "DefaultRedirectURI",
      ),
      SupportedIdentityProviders: this.stringArray(
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

  private stringArray(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): readonly string[] | undefined {
    return this.propertyParser.optionalStringArray(this.resource, value, label);
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
