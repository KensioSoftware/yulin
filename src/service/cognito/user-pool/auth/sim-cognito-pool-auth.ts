import { SimCognitoIdentityProviderStore } from "../idp/sim-cognito-identity-provider-store.js";
import type { SimCognitoUserPoolDomain } from "../domain/sim-cognito-user-pool-domain.js";
import type { SimCognitoAuthSession } from "./sim-cognito-auth-session.js";
import {
  SimCognitoAuthSessionStore,
  type SimCognitoAuthSessionRequest,
} from "./sim-cognito-auth-session-store.js";
import type { SimCognitoAuthorizationCode } from "./sim-cognito-authorization-code.js";
import { SimCognitoAuthorizationCodeStore } from "./sim-cognito-authorization-code-store.js";
import type { SimCognitoIssuedToken } from "./sim-cognito-issued-token.js";
import type { SimCognitoManagedLoginSession } from "./sim-cognito-managed-login-session.js";
import { SimCognitoManagedLoginSessionStore } from "./sim-cognito-managed-login-session-store.js";
import {
  SimCognitoIssuedTokenStore,
  type SimCognitoRefreshTokenRequest,
} from "./sim-cognito-issued-token-store.js";

/**
 * The authentication state of one simulated user pool: where users can sign
 * in, the sign-ins that are part way through, and the tokens the finished ones
 * handed out.
 *
 * These live together because signing a user out reaches more than one of
 * them, and because keeping them here leaves `SimCognitoUserPool` as what it
 * is elsewhere, a resource holding its contents.
 *
 * The hosted domain and the external identity providers are here for the same
 * reason. A domain is where a browser signs in, a provider is who it signs in
 * with, and an authorization code is a sign-in part way through, in the same
 * way a challenge session is.
 */
export class SimCognitoPoolAuth {
  /**
   * The external identity providers this pool federates to.
   */
  public readonly identityProviders = new SimCognitoIdentityProviderStore();

  private readonly sessions = new SimCognitoAuthSessionStore();
  private readonly managedLogin = new SimCognitoManagedLoginSessionStore();
  private readonly codes = new SimCognitoAuthorizationCodeStore();
  private readonly tokens = new SimCognitoIssuedTokenStore();

  #domain: SimCognitoUserPoolDomain | undefined;

  /**
   * The hosted domain this pool serves its OAuth endpoints on, if it has one.
   *
   * A pool has at most one, as a real pool does: a prefix domain and a custom
   * domain are two forms of the same thing rather than two domains.
   */
  get domain(): SimCognitoUserPoolDomain | undefined {
    return this.#domain;
  }

  /**
   * Give this pool the domain a `CreateUserPoolDomain` request asked for.
   */
  addDomain(domain: SimCognitoUserPoolDomain): void {
    this.#domain = domain;
  }

  /**
   * Forget this pool's domain, because it has been deleted.
   */
  removeDomain(): void {
    this.#domain = undefined;
  }

  /**
   * Remember an authorization code this pool handed to a browser.
   */
  addAuthorizationCode(code: SimCognitoAuthorizationCode): void {
    this.codes.add(code);
  }

  /**
   * Take the authorization code a token request carries, if this pool still
   * holds one that has not run out.
   */
  spendAuthorizationCode(
    value: string | undefined,
    now: Date,
  ): SimCognitoAuthorizationCode | undefined {
    return this.codes.spend(value, now);
  }

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
   * Find a refresh token this pool issued and still holds.
   */
  findRefreshToken(
    value: string | undefined,
  ): SimCognitoIssuedToken | undefined {
    return this.tokens.findRefreshToken(value);
  }

  /**
   * Find an access token this pool issued and still honours.
   */
  findAccessToken(value: string): SimCognitoIssuedToken | undefined {
    return this.tokens.findAccessToken(value);
  }

  /**
   * Remember the managed login session a hosted sign-in started for a browser.
   */
  addManagedLoginSession(session: SimCognitoManagedLoginSession): void {
    this.managedLogin.add(session);
  }

  /**
   * The managed login session a browser presented, if this pool still holds
   * it and it has not run out.
   */
  findManagedLoginSession(
    value: string | undefined,
    now: Date,
  ): SimCognitoManagedLoginSession | undefined {
    return this.managedLogin.find(value, now);
  }

  /**
   * End the managed login session a browser presented at `/logout`.
   */
  endManagedLoginSession(value: string | undefined): void {
    this.managedLogin.end(value);
  }

  /**
   * Sign a user out of every app client, forgetting the tokens it holds.
   *
   * The managed login sessions are left alone, because real `GlobalSignOut`
   * and `AdminUserGlobalSignOut` leave them alone. They revoke tokens, and a
   * browser still holding the `cognito` cookie signs in again at the authorize
   * endpoint without a password. `/logout` is what ends that.
   */
  signOut(username: string): void {
    this.tokens.forgetUser(username);
  }
}
