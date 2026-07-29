import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

const maxIdentifierLength = 128;

/**
 * The characters Cognito allows in a username and in a group name: letters,
 * marks, symbols, numbers and punctuation, and no whitespace among them.
 */
const identifierPattern = /^[\p{L}\p{M}\p{S}\p{N}\p{P}]+$/u;

interface SimCognitoIdentifierProperties {
  /**
   * The request input the value came from, such as `GroupName`, so a refusal
   * names the field the caller wrote.
   */
  readonly field: string;
  /**
   * What the identifier names, such as `group`, for the same reason.
   */
  readonly subject: string;
  readonly value: string | undefined;
}

/**
 * A username or a group name.
 *
 * Cognito gives both the same form, so the rule lives here once: required, at
 * most 128 characters, and no whitespace. Both are validated before anything
 * is looked up, so a value Cognito would reject fails as a validation error
 * rather than as a missing user or group.
 */
export class SimCognitoIdentifier {
  public readonly value: string;

  constructor(properties: SimCognitoIdentifierProperties) {
    const { field, subject, value } = properties;

    if (value === undefined || value === "") {
      throw new SimCognitoInvalidParameterException(
        `${field} is required: name the ${subject} the request is for`,
      );
    }

    if (value.length > maxIdentifierLength) {
      throw new SimCognitoInvalidParameterException(
        `${field} '${value}' is longer than the ` +
          `${String(maxIdentifierLength)} characters Cognito allows`,
      );
    }

    if (!identifierPattern.test(value)) {
      throw new SimCognitoInvalidParameterException(
        `${field} '${value}' contains characters Cognito does not allow: a ` +
          `${subject} name may not hold whitespace`,
      );
    }

    this.value = value;
  }
}
