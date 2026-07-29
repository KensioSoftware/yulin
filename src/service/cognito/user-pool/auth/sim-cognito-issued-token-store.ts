import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIssuedToken } from "./sim-cognito-issued-token.js";

/**
 * What a refresh request has to match for its token to be accepted.
 */
export interface SimCognitoRefreshTokenRequest {
  readonly value: string;
  readonly clientId: string;
  readonly now: Date;
}

/**
 * The tokens one simulated user pool has issued and still honours.
 *
 * Signing a user out forgets theirs, which is what makes a later refresh fail:
 * real Cognito revokes a signed-out user's tokens rather than waiting for them
 * to expire. A token that has run out is forgotten too, so a long-running
 * simulation does not hold every token it ever signed.
 */
export class SimCognitoIssuedTokenStore {
  private readonly refreshTokens = new Map<string, SimCognitoIssuedToken>();
  private readonly accessTokens = new Map<string, SimCognitoIssuedToken>();

  /**
   * Forget the tokens a rule marks as spent, taking their values out first so
   * nothing is deleted while it is still being read.
   */
  private static forgetSpent(
    tokens: Map<string, SimCognitoIssuedToken>,
    spent: (issued: SimCognitoIssuedToken) => boolean,
  ): void {
    const values = tokens
      .values()
      .filter(spent)
      .map((issued) => issued.value)
      .toArray();

    for (const value of values) {
      tokens.delete(value);
    }
  }

  /**
   * Remember a refresh token, so it can be exchanged later.
   */
  addRefreshToken(token: SimCognitoIssuedToken): void {
    SimCognitoIssuedTokenStore.forgetSpent(this.refreshTokens, (issued) =>
      issued.isExpiredAt(token.issuedAt),
    );
    this.refreshTokens.set(token.value, token);
  }

  /**
   * Remember an access token, so a sign-out can be authorized with it.
   */
  addAccessToken(token: SimCognitoIssuedToken): void {
    SimCognitoIssuedTokenStore.forgetSpent(this.accessTokens, (issued) =>
      issued.isExpiredAt(token.issuedAt),
    );
    this.accessTokens.set(token.value, token);
  }

  /**
   * Resolve the refresh token a request carries, or refuse.
   *
   * A token this pool never issued, one belonging to another app client, one
   * that has run out, and one the user has been signed out of all fail the
   * same way, as they do on real Cognito.
   */
  requireRefreshToken(
    request: SimCognitoRefreshTokenRequest,
  ): SimCognitoIssuedToken {
    const issued = this.refreshTokens.get(request.value);

    if (issued?.isFor(request.clientId) !== true) {
      throw new SimCognitoNotAuthorizedException("Invalid Refresh Token.");
    }

    if (issued.isExpiredAt(request.now)) {
      throw new SimCognitoNotAuthorizedException("Refresh Token has expired.");
    }

    return issued;
  }

  /**
   * Find an access token this pool issued and still honours.
   *
   * A token from a signed-out session has been forgotten by then, so nothing
   * comes back for it, which is the `Access Token has been revoked` real
   * Cognito answers a request carrying one with.
   */
  findAccessToken(value: string): SimCognitoIssuedToken | undefined {
    return this.accessTokens.get(value);
  }

  /**
   * Forget every token issued to a user, whichever app client got it.
   *
   * This is what a global sign-out does, and what deleting a user does: a
   * token outliving the user it names would sign in someone the pool cannot
   * describe.
   */
  forgetUser(username: string): void {
    const theirs = (issued: SimCognitoIssuedToken): boolean =>
      issued.username === username;

    SimCognitoIssuedTokenStore.forgetSpent(this.refreshTokens, theirs);
    SimCognitoIssuedTokenStore.forgetSpent(this.accessTokens, theirs);
  }
}
