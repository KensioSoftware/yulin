import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";
import type { SimCognitoAuthSession } from "./sim-cognito-auth-session.js";

/**
 * What a challenge response has to match for its session to be accepted.
 */
export interface SimCognitoAuthSessionRequest {
  readonly sessionId: string | undefined;
  readonly username: string;
  readonly clientId: string;
  readonly now: Date;
}

/**
 * The unfinished authentications of one simulated user pool.
 *
 * A session is forgotten as soon as it is used, so a replayed one fails the
 * way it does on real Cognito.
 */
export class SimCognitoAuthSessionStore {
  private readonly sessions = new Map<string, SimCognitoAuthSession>();

  /**
   * Remember a session a challenge was issued with.
   */
  add(session: SimCognitoAuthSession): void {
    this.sessions.set(session.id, session);
  }

  /**
   * Find a session by the opaque string it was issued as.
   */
  find(sessionId: string | undefined): SimCognitoAuthSession | undefined {
    if (sessionId === undefined) {
      return undefined;
    }

    return this.sessions.get(sessionId);
  }

  /**
   * Resolve the session a challenge response carries, or refuse.
   *
   * A session this pool never issued, one already used, one for another user
   * or app client, and one that has run out all fail the same way, as they do
   * on real Cognito.
   */
  require(request: SimCognitoAuthSessionRequest): SimCognitoAuthSession {
    const session = this.find(request.sessionId);

    if (
      session === undefined ||
      !session.belongsTo(request.username, request.clientId) ||
      session.isExpiredAt(request.now)
    ) {
      throw new SimCognitoNotAuthorizedException(
        "Invalid session for the user.",
      );
    }

    return session;
  }

  /**
   * Forget a session that has been used.
   */
  remove(session: SimCognitoAuthSession): void {
    this.sessions.delete(session.id);
  }
}
