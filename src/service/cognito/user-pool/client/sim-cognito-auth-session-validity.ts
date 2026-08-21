import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * How long a challenge session lasts when the app client says nothing, which
 * is the default real Cognito applies.
 */
const defaultMinutes = 3;

const leastMinutes = 3;
const mostMinutes = 15;

const secondsPerMinute = 60;
const millisecondsPerSecond = 1000;

/**
 * How long the challenge sessions of one simulated app client last.
 *
 * A sign-in that is answered with a challenge carries a session between the
 * request that started it and the response that finishes it, and this is the
 * window the response has to arrive in. Cognito counts it in whole minutes,
 * gives a client that asked for none three of them, and takes between three
 * and fifteen.
 *
 * It is worth setting in a test that has anything to say about a session
 * running out: three minutes of simulated time is quick to pass, and a
 * fifteen-minute client is what makes the expiry visible as a choice rather
 * than a constant.
 */
export class SimCognitoAuthSessionValidity {
  /**
   * The validity in minutes, as Cognito reports it on the client.
   */
  public readonly minutes: number;

  constructor(requested?: number) {
    this.minutes = SimCognitoAuthSessionValidity.minutesIn(requested);
  }

  private static minutesIn(requested: number | undefined): number {
    if (requested === undefined) {
      return defaultMinutes;
    }

    if (!Number.isSafeInteger(requested)) {
      throw new SimCognitoInvalidParameterException(
        "AuthSessionValidity must be a whole number of minutes",
      );
    }

    if (requested < leastMinutes || requested > mostMinutes) {
      throw new SimCognitoInvalidParameterException(
        `AuthSessionValidity of ${String(requested)} minutes is outside the ` +
          `range Cognito allows: between ${String(leastMinutes)} and ` +
          `${String(mostMinutes)} minutes`,
      );
    }

    return requested;
  }

  /**
   * When a session issued at a moment runs out.
   */
  expiryOf(issuedAt: Date): Date {
    return new Date(
      issuedAt.getTime() +
        this.minutes * secondsPerMinute * millisecondsPerSecond,
    );
  }
}
