import type { SimCognitoAuthorizationCode } from "./sim-cognito-authorization-code.js";

/**
 * The authorization codes one simulated user pool has issued and not yet been
 * given back.
 *
 * A code is forgotten as soon as it is redeemed, which is what makes a second
 * request carrying the same code fail the way it does on real Cognito.
 */
export class SimCognitoAuthorizationCodeStore {
  private readonly codes = new Map<string, SimCognitoAuthorizationCode>();

  /**
   * Remember a code an authorize request handed to a browser.
   *
   * A code nobody redeemed is dropped once it has run out, so a simulation
   * left running does not hold every abandoned sign-in.
   */
  add(code: SimCognitoAuthorizationCode): void {
    this.forgetExpired(code.issuedAt);
    this.codes.set(code.value, code);
  }

  /**
   * Take the code a token request carries, if this pool still holds it.
   *
   * Redeeming spends the code, whether or not the rest of the request turns
   * out to be right: real Cognito treats a code as used once it has been
   * presented, so a failed exchange cannot be retried with the same one.
   */
  spend(
    value: string | undefined,
    now: Date,
  ): SimCognitoAuthorizationCode | undefined {
    if (value === undefined) {
      return undefined;
    }

    const code = this.codes.get(value);

    if (code === undefined) {
      return undefined;
    }

    this.codes.delete(value);

    if (code.isExpiredAt(now)) {
      return undefined;
    }

    return code;
  }

  private forgetExpired(now: Date): void {
    const expired = this.codes
      .values()
      .filter((code) => code.isExpiredAt(now))
      .map((code) => code.value)
      .toArray();

    for (const value of expired) {
      this.codes.delete(value);
    }
  }
}
