import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

const namePattern = /^[\w\s+=,.@-]+$/u;
const maxNameLength = 128;

interface SimCognitoNameProperties {
  /**
   * The request input the name came from, such as `PoolName`, so a refusal
   * names the field the caller wrote rather than a term only this simulation
   * uses.
   */
  readonly field: string;
  readonly value: string | undefined;
}

/**
 * The friendly name of a user pool or of an app client.
 *
 * Both take the same form on real Cognito: required, at most 128 characters,
 * and limited to word characters, whitespace and `+=,.@-`. A name is not an
 * identifier, so nothing stops two pools sharing one.
 */
export class SimCognitoName {
  public readonly value: string;

  constructor(properties: SimCognitoNameProperties) {
    const { field, value } = properties;

    if (value === undefined || value === "") {
      throw new SimCognitoInvalidParameterException(`${field} is required`);
    }

    if (value.length > maxNameLength) {
      throw new SimCognitoInvalidParameterException(
        `${field} '${value}' is longer than the ${String(maxNameLength)} ` +
          `characters Cognito allows`,
      );
    }

    if (!namePattern.test(value)) {
      throw new SimCognitoInvalidParameterException(
        `${field} '${value}' contains characters Cognito does not allow: a ` +
          `name may hold letters, digits, underscores, whitespace and +=,.@-`,
      );
    }

    this.value = value;
  }
}
