import { SimCognitoCodeMismatchException } from "../../error/sim-cognito.error.js";
import { SimCognitoConfirmationCode } from "./sim-cognito-confirmation-code.js";
import type { SimCognitoUserStatus } from "./sim-cognito-user-status.js";

/**
 * The confirmation one user has outstanding.
 *
 * A user that signed itself up holds a code until it confirms, and a user that
 * did not holds none. Keeping the code and what it answers together is the
 * same modelling choice `SimCognitoUserPassword` makes: the user asks whether
 * a candidate is right, rather than reading the value out to compare it.
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
   * `UNCONFIRMED` has spent it: a code confirms one sign-up and no more.
   */
  settle(status: SimCognitoUserStatus): void {
    this.#code = status.isUnconfirmed
      ? SimCognitoConfirmationCode.issue()
      : undefined;
  }

  /**
   * Refuse a candidate that is not the code outstanding.
   */
  require(candidate: string | undefined): void {
    if (this.#code?.matches(candidate) !== true) {
      throw new SimCognitoCodeMismatchException(
        "Invalid verification code provided, please try again.",
      );
    }
  }
}
