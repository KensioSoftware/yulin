import {
  SimCognitoInvalidParameterException,
  SimCognitoInvalidPasswordException,
} from "../error/sim-cognito.error.js";
import type { SimCognitoPasswordPolicy } from "./sim-cognito-password-policy.js";

const maxPasswordLength = 256;

/**
 * The characters Cognito counts as symbols in a password.
 */
const symbolPattern = /[\^$*.[\]{}()?"!@#%&/\\,><':;|_~`+= -]/u;

/**
 * The letters Cognito counts towards the uppercase and lowercase requirements.
 *
 * A password may hold any Unicode character, and which of them satisfy these
 * two rules is not documented, so basic Latin is what counts here. That
 * refuses a password of, say, Greek letters that real Cognito might accept.
 * Refusing one it would have taken is a puzzling test failure; taking one it
 * would have refused is a sign-up that fails in a deployment.
 */
const uppercasePattern = /[A-Z]/u;
const lowercasePattern = /[a-z]/u;
const numberPattern = /\d/u;

/**
 * Checks a password against one pool's password policy.
 *
 * A password is checked wherever one arrives, so the rules live here once
 * rather than at `AdminCreateUser` and `AdminSetUserPassword` separately. The
 * refusals say which rule the password broke, in the words real Cognito uses,
 * because that message is often the only thing a test has to go on.
 */
export class SimCognitoPasswordCheck {
  private readonly policy: SimCognitoPasswordPolicy;

  constructor(policy: SimCognitoPasswordPolicy) {
    this.policy = policy;
  }

  private static refuse(reason: string): never {
    throw new SimCognitoInvalidPasswordException(
      `Password did not conform with policy: ${reason}`,
    );
  }

  /**
   * Refuse a password this pool would not accept.
   *
   * A missing password is a validation error rather than a policy failure,
   * because real Cognito rejects the request before it reaches the policy.
   */
  require(field: string, password: string | undefined): void {
    if (password === undefined || password === "") {
      throw new SimCognitoInvalidParameterException(
        `${field} is required: give the user a password the pool's policy allows`,
      );
    }

    if (password.length > maxPasswordLength) {
      throw new SimCognitoInvalidPasswordException(
        `${field} is longer than the ${String(maxPasswordLength)} characters ` +
          `Cognito allows`,
      );
    }

    this.requirePolicy(password);
  }

  private requirePolicy(password: string): void {
    if (password.length < this.policy.minimumLength) {
      SimCognitoPasswordCheck.refuse("Password not long enough");
    }

    this.requireCharacters(password);
  }

  private requireCharacters(password: string): void {
    if (this.policy.requiresUppercase && !uppercasePattern.test(password)) {
      SimCognitoPasswordCheck.refuse("Password must have uppercase characters");
    }

    if (this.policy.requiresLowercase && !lowercasePattern.test(password)) {
      SimCognitoPasswordCheck.refuse("Password must have lowercase characters");
    }

    if (this.policy.requiresNumbers && !numberPattern.test(password)) {
      SimCognitoPasswordCheck.refuse("Password must have numeric characters");
    }

    if (this.policy.requiresSymbols && !symbolPattern.test(password)) {
      SimCognitoPasswordCheck.refuse("Password must have symbol characters");
    }
  }
}
