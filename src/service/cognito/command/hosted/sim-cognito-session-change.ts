/**
 * What a hosted request did to the browser's managed login session.
 */
export type SimCognitoSessionOutcome = "started" | "reused" | "ended";

/**
 * The change a hosted endpoint makes to the browser's managed login session.
 *
 * Real managed login keeps the session in the `cognito` cookie on the pool's
 * domain, and the serving layer here is what sets and clears that cookie. A
 * test calling an endpoint directly reads the change from here, which is how
 * it tells a sign-in that took a password from one the session answered.
 */
export class SimCognitoSessionChange {
  public readonly outcome: SimCognitoSessionOutcome;

  /**
   * The session the browser is given, where this request started one.
   */
  public readonly startedSession: string | undefined;

  private constructor(
    outcome: SimCognitoSessionOutcome,
    startedSession: string | undefined,
  ) {
    this.outcome = outcome;
    this.startedSession = startedSession;
  }

  /**
   * A sign-in that took credentials and started a session for the browser.
   */
  static started(value: string): SimCognitoSessionChange {
    return new SimCognitoSessionChange("started", value);
  }

  /**
   * A sign-in the browser's own session answered, taking no credentials.
   *
   * Nothing is handed back, because the browser already holds the session.
   * Real Cognito leaves the hour where the first sign-in started it.
   */
  static reused(): SimCognitoSessionChange {
    return new SimCognitoSessionChange("reused", undefined);
  }

  /**
   * A sign-out, which leaves the browser holding no session.
   */
  static ended(): SimCognitoSessionChange {
    return new SimCognitoSessionChange("ended", undefined);
  }

  /**
   * Whether this request took the session out of the browser.
   */
  get endsSession(): boolean {
    return this.outcome === "ended";
  }
}
