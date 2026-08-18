import type { SimCognitoUserConfirmation } from "./sim-cognito-user-confirmation.js";
import { SimCognitoUserStatus } from "./sim-cognito-user-status.js";

interface SimCognitoUserPasswordResetProperties {
  /** The code the user has outstanding, which a reset issues and spends. */
  readonly confirmation: SimCognitoUserConfirmation;

  /** Where the user is now, which decides whether it can reset at all. */
  readonly status: () => SimCognitoUserStatus;

  /** Move the user to a status. */
  readonly moved: (status: SimCognitoUserStatus) => void;

  /** Give the user a permanent password of its own. */
  readonly chosen: (password: string) => void;

  /** Note that the user changed without moving to another status. */
  readonly changed: () => void;
}

/**
 * The password reset one simulated user can go through.
 *
 * A reset is two operations apart: the user asks for one and is sent a code,
 * then answers with that code and a password of its own. An administrator
 * starts a third way, by taking the password away and leaving the user in
 * `RESET_REQUIRED` holding the same kind of code.
 *
 * The code is the one `SimCognitoUserConfirmation` holds, because a user has
 * one thing outstanding at a time and a reset code and a sign-up code are the
 * same six digits sent the same way. A test reads it back off the pool for the
 * same reason it reads a sign-up code back: nothing here delivers a message.
 */
export class SimCognitoUserPasswordReset {
  private readonly confirmation: SimCognitoUserConfirmation;
  private readonly status: () => SimCognitoUserStatus;
  private readonly moved: (status: SimCognitoUserStatus) => void;
  private readonly chosen: (password: string) => void;
  private readonly changed: () => void;

  constructor(properties: SimCognitoUserPasswordResetProperties) {
    this.confirmation = properties.confirmation;
    this.status = properties.status;
    this.moved = properties.moved;
    this.chosen = properties.chosen;
    this.changed = properties.changed;
  }

  /**
   * Start a reset, issuing the code that finishes it.
   *
   * The user stays where it is: real Cognito moves nobody on for asking, and
   * the password it has goes on working until the reset is confirmed. Asking
   * twice issues a second code and forgets the first, as a resent sign-up code
   * does.
   */
  start(): void {
    this.status().requireSelfResettable();
    this.confirmation.issue();
    this.changed();
  }

  /**
   * Finish a reset with the code that started it.
   *
   * The user reaches `CONFIRMED`, which takes it out of `RESET_REQUIRED` and
   * confirms one that never confirmed its sign-up, as real Cognito does. The
   * old password stops working, and so does the code.
   */
  confirm(code: string | undefined, password: string): void {
    this.status().requireSelfResettable();
    this.confirmation.require(code);
    this.chosen(password);
  }

  /**
   * Take the user's password away, and issue the code it sets another with.
   *
   * This is `AdminResetUserPassword`. The user is refused at sign-in until it
   * answers `ConfirmForgotPassword`, which is the whole of what
   * `RESET_REQUIRED` is for.
   */
  require(): void {
    this.status().requireResettable();
    this.moved(SimCognitoUserStatus.resetRequired);
  }
}
