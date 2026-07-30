import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateUserPoolClientCommandInput } from "../../command/client/user-pool-client.command.js";
import type { SimCognitoTokenValidityUnitsType } from "../../user-pool/client/sim-cognito-token-validity.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The AWS::Cognito::UserPoolClient properties this simulation deploys.
 *
 * The OAuth and managed login properties are absent because the hosted UI is
 * not simulated at all, so a client deployed with them would offer flows
 * nothing here can run.
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
];

/**
 * The `TokenValidityUnits` fields, which are all of them.
 */
const modelledValidityUnits = ["AccessToken", "IdToken", "RefreshToken"];

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

    this.propertyParser.requireOnlySimulated(this.resource, this.properties);
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
      ClientName: this.string(this.properties["ClientName"], "ClientName"),
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
      TokenValidityUnits: this.tokenValidityUnits(),
    };
  }

  /**
   * The units the three validity numbers are counted in.
   */
  private tokenValidityUnits(): SimCognitoTokenValidityUnitsType | undefined {
    const units = this.propertyParser.optionalRecord(
      this.resource,
      this.properties["TokenValidityUnits"],
      "TokenValidityUnits",
    );

    if (units === undefined) {
      return undefined;
    }

    this.propertyParser.requireOnlyKeys(
      this.resource,
      units,
      modelledValidityUnits,
      "TokenValidityUnits ",
    );

    return {
      AccessToken: this.unit(units["AccessToken"], "AccessToken"),
      IdToken: this.unit(units["IdToken"], "IdToken"),
      RefreshToken: this.unit(units["RefreshToken"], "RefreshToken"),
    };
  }

  private unit(
    value: SimCfnTemplateValue | undefined,
    field: string,
  ): string | undefined {
    return this.string(value, `TokenValidityUnits ${field}`);
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
