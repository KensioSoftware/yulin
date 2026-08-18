import {
  SimCognitoCodeMismatchException,
  SimCognitoExpiredCodeException,
} from "../../error/sim-cognito.error.js";
import { SimCognitoConfirmationCode } from "./sim-cognito-confirmation-code.js";
import type { SimCognitoUserStatus } from "./sim-cognito-user-status.js";

/**
 * The code one user has outstanding.
 *
 * A user that signed itself up holds one until it confirms, a user that asked
 * to reset a forgotten password holds one until it sets the new one, and a
 * user doing neither holds none. Keeping the code and what it answers together
 * is the same modelling choice `SimCognitoUserPassword` makes: the user asks
 * whether a candidate is right, rather than reading the value out to compare
 * it.
 *
 * The value is readable, unlike a password, because nothing here delivers the
 * message that would carry it.
 */
export class SimCognitoUserConfirmation {
  #code: SimCognitoConfirmationCode | undefined;

  constructor(status: SimCognitoUserStatus) {
    this.settle(status);
  }

  /**
   * The code outstanding, if there is one.
   */
  get code(): string | undefined {
    return this.#code?.value;
  }

  /**
   * Issue a fresh code, forgetting any outstanding one.
   */
  issue(): void {
    this.#code = SimCognitoConfirmationCode.issue();
  }

  /**
   * Follow the user to a status.
   *
   * A user waiting to be confirmed holds a code, and one that has left
   * `UNCONFIRMED` has spent it: a code confirms one sign-up and no more. A
   * user an administrator has sent to `RESET_REQUIRED` is issued its code
   * after the move, because the code is what the reset is answered with.
   */
  settle(status: SimCognitoUserStatus): void {
    this.#code = status.holdsCode
      ? SimCognitoConfirmationCode.issue()
      : undefined;
  }

  /**
   * Refuse a candidate that is not the code outstanding.
   *
   * A user holding no code at all is refused as having an expired one, which
   * is what real Cognito answers a code that has already been spent with.
   * Nothing here ages a code out, so that is the only way to reach it.
   */
  require(candidate: string | undefined): void {
    if (this.#code === undefined) {
      throw new SimCognitoExpiredCodeException(
        "Invalid code provided, please request a code again.",
      );
    }

    if (!this.#code.matches(candidate)) {
      throw new SimCognitoCodeMismatchException(
        "Invalid verification code provided, please try again.",
      );
    }
  }
}
