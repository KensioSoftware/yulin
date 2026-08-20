import type { SimCognitoManagedLoginSession } from "./sim-cognito-managed-login-session.js";

/**
 * The managed login sessions one simulated user pool has going.
 *
 * A session belongs to the pool's domain rather than to an app client, as a
 * real one does: a browser that signed in for one app client is a returning
 * browser to every other app client of the same pool.
 */
export class SimCognitoManagedLoginSessionStore {
  private readonly sessions = new Map<string, SimCognitoManagedLoginSession>();

  /**
   * Remember a session a sign-in started for a browser.
   */
  add(session: SimCognitoManagedLoginSession): void {
    this.sessions.set(session.value, session);
  }

  /**
   * The session a browser presented, if this pool still holds it.
   */
  find(
    value: string | undefined,
    now: Date,
  ): SimCognitoManagedLoginSession | undefined {
    if (value === undefined) {
      return undefined;
    }

    const session = this.sessions.get(value);

    if (session === undefined) {
      return undefined;
    }

    if (session.isExpiredAt(now)) {
      this.sessions.delete(value);

      return undefined;
    }

    return session;
  }

  /**
   * Forget a session, because the browser holding it has signed out.
   */
  end(value: string | undefined): void {
    if (value === undefined) {
      return;
    }

    this.sessions.delete(value);
  }
}
