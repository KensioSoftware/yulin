import type { SimCognitoAuthSession } from "./sim-cognito-auth-session.js";
import {
  SimCognitoAuthSessionStore,
  type SimCognitoAuthSessionRequest,
} from "./sim-cognito-auth-session-store.js";
import type { SimCognitoIssuedToken } from "./sim-cognito-issued-token.js";
import {
  SimCognitoIssuedTokenStore,
  type SimCognitoRefreshTokenRequest,
} from "./sim-cognito-issued-token-store.js";

/**
 * The authentication state of one simulated user pool: the sign-ins that are
 * part way through, and the tokens the finished ones handed out.
 *
 * The two live together because signing a user out reaches both kinds of
 * state, and because keeping them here leaves `SimCognitoUserPool` as what it
 * is elsewhere, a resource holding its contents.
 */
export class SimCognitoPoolAuth {
  private readonly sessions = new SimCognitoAuthSessionStore();
  private readonly tokens = new SimCognitoIssuedTokenStore();

  /**
   * Remember a challenge session an authentication was left waiting on.
   */
  addSession(session: SimCognitoAuthSession): void {
    this.sessions.add(session);
  }

  /**
   * Resolve the challenge session a response carries, or refuse.
   */
  requireSession(request: SimCognitoAuthSessionRequest): SimCognitoAuthSession {
    return this.sessions.require(request);
  }

  /**
   * Forget a challenge session that has been used.
   */
  removeSession(session: SimCognitoAuthSession): void {
    this.sessions.remove(session);
  }

  /**
   * Remember a refresh token this pool has issued.
   */
  addRefreshToken(token: SimCognitoIssuedToken): void {
    this.tokens.addRefreshToken(token);
  }

  /**
   * Remember an access token this pool has issued.
   */
  addAccessToken(token: SimCognitoIssuedToken): void {
    this.tokens.addAccessToken(token);
  }

  /**
   * Resolve the refresh token a refresh request carries, or refuse.
   */
  requireRefreshToken(
    request: SimCognitoRefreshTokenRequest,
  ): SimCognitoIssuedToken {
    return this.tokens.requireRefreshToken(request);
  }

  /**
   * Find an access token this pool issued and still honours.
   */
  findAccessToken(value: string): SimCognitoIssuedToken | undefined {
    return this.tokens.findAccessToken(value);
  }

  /**
   * Sign a user out of every app client, forgetting the tokens it holds.
   */
  signOut(username: string): void {
    this.tokens.forgetUser(username);
  }
}
