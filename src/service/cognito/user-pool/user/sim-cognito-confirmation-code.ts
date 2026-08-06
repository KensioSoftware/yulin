import { randomInt } from "node:crypto";

/**
 * How many digits a Cognito confirmation code has.
 */
const codeDigits = 6;

/**
 * The confirmation code a pool issues to a user that signed itself up.
 *
 * Real Cognito emails or texts the code and never reports it back, so a value
 * object here would be write-only if it exposed nothing. It exposes its value,
 * and a pool hands that value to a test through
 * `SimCognitoUserPool.confirmationCode`, because nothing here delivers a
 * message for a test to read the code from. That is the one place this
 * simulation knowingly tells a caller something real Cognito would not.
 *
 * The code is six digits, as a real one is, so code parsing or validating it
 * gets the shape it would get in a deployment.
 */
export class SimCognitoConfirmationCode {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Issue a fresh code.
   *
   * Leading zeros are kept, because a real code has them and a test treating
   * the value as a number would lose them.
   */
  static issue(): SimCognitoConfirmationCode {
    return new SimCognitoConfirmationCode(
      String(randomInt(0, 10 ** codeDigits)).padStart(codeDigits, "0"),
    );
  }

  /**
   * Whether a candidate is this code.
   */
  matches(candidate: string | undefined): boolean {
    return candidate === this.value;
  }
}
