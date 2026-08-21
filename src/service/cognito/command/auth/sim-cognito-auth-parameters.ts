import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The values an authentication request carries alongside the flow.
 *
 * `AdminInitiateAuth` calls them `AuthParameters` and
 * `AdminRespondToAuthChallenge` calls them `ChallengeResponses`, so a refusal
 * names whichever the caller wrote.
 */
export class SimCognitoAuthParameters {
  private readonly field: string;
  private readonly values: ReadonlyMap<string, string>;

  constructor(
    field: string,
    values: Readonly<Record<string, string>> | undefined,
  ) {
    this.field = field;
    this.values = new Map(Object.entries(values ?? {}));
  }

  /**
   * Read a value the flow needs, or refuse.
   */
  require(name: string): string {
    const value = this.find(name);

    if (value === undefined || value === "") {
      throw new SimCognitoInvalidParameterException(
        `Missing required parameter ${name} in ${this.field}`,
      );
    }

    return value;
  }

  /**
   * Read a value the flow needs as the JSON document it carries.
   *
   * A challenge response carries strings, so a credential travels as the JSON
   * a browser serialized it to, which is how real Cognito takes one.
   */
  requireDocument(name: string): unknown {
    const value = this.require(name);

    try {
      return JSON.parse(value);
    } catch {
      throw new SimCognitoInvalidParameterException(
        `${name} in ${this.field} must be JSON: a credential travels as the ` +
          `JSON a browser serializes a PublicKeyCredential to`,
      );
    }
  }

  /**
   * Read a value that may or may not be there.
   */
  find(name: string): string | undefined {
    return this.values.get(name);
  }
}
