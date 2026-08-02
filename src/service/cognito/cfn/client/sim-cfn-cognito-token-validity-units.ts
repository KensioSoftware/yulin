import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoTokenValidityUnitsType } from "../../user-pool/client/sim-cognito-token-validity.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The `TokenValidityUnits` fields, which are all of them.
 */
const modelledFields = ["AccessToken", "IdToken", "RefreshToken"];

interface SimCfnCognitoTokenValidityUnitsProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `TokenValidityUnits` property of an AWS::Cognito::UserPoolClient
 * Resource into the shape CreateUserPoolClient takes.
 *
 * What each unit may be is left to the client, which is where the same
 * request from an SDK caller is checked.
 */
export class SimCfnCognitoTokenValidityUnits {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoTokenValidityUnitsProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The units the three validity numbers are counted in, or undefined when
   * the template names none.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): SimCognitoTokenValidityUnitsType | undefined {
    const units = this.propertyParser.optionalRecord(
      this.resource,
      value,
      "TokenValidityUnits",
    );

    if (units === undefined) {
      return undefined;
    }

    this.propertyParser.requireOnlyKeys(
      this.resource,
      units,
      modelledFields,
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
    return this.propertyParser.optionalString(
      this.resource,
      value,
      `TokenValidityUnits ${field}`,
    );
  }
}
