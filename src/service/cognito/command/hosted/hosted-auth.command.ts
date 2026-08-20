import type { SimCognitoSessionChange } from "./sim-cognito-session-change.js";

/**
 * The `/oauth2/authorize` query parameters this simulation reads.
 *
 * The names are the wire names rather than this repository's usual ones,
 * because they are what an application puts in a URL and what a test asserts
 * on.
 *
 * https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html
 */
export interface SimCognitoAuthorizeInput {
  readonly response_type?: string | undefined;
  readonly client_id?: string | undefined;
  readonly redirect_uri?: string | undefined;
  readonly state?: string | undefined;
  readonly scope?: string | undefined;
  readonly identity_provider?: string | undefined;
  readonly idp_identifier?: string | undefined;
  readonly code_challenge?: string | undefined;
  readonly code_challenge_method?: string | undefined;

  /**
   * The username a pool's own user signs in with.
   *
   * Real Cognito takes these two from the managed login form rather than from
   * the query string, and a request carrying them here is the form post the
   * simulation's own sign-in page makes. Naming no identity provider and
   * carrying these two is what tells a local sign-in from a federated one.
   */
  readonly username?: string | undefined;
  readonly password?: string | undefined;
}

/**
 * Where a hosted endpoint sends the browser next.
 */
export interface SimCognitoHostedRedirect {
  readonly location: string;

  /** The user the redirect signed in, where one was signed in. */
  readonly username?: string | undefined;

  /**
   * What the request did to the browser's managed login session.
   *
   * A sign-in that took credentials starts one, a sign-in the browser's own
   * session answered reuses it, and a sign-out ends it. Every request that
   * reaches a redirect has done one of the three, so reading this is how a
   * test tells a sign-in that needed a password from one that did not.
   */
  readonly session: SimCognitoSessionChange;
}

/**
 * The `/oauth2/token` request fields this simulation reads.
 *
 * The client id and secret arrive either in the body or in a basic
 * authorization header, and are read into the same two fields here, because
 * which of the two a request used changes nothing about what it asked for.
 *
 * https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html
 */
export interface SimCognitoTokenInput {
  readonly grant_type?: string | undefined;
  readonly client_id?: string | undefined;
  readonly client_secret?: string | undefined;
  readonly code?: string | undefined;
  readonly redirect_uri?: string | undefined;
  readonly code_verifier?: string | undefined;
  readonly refresh_token?: string | undefined;
}

/**
 * What `/oauth2/token` answers a successful grant with.
 *
 * `id_token` is absent where the grant was made without the `openid` scope,
 * and `refresh_token` is absent from a refresh, as both are on real Cognito.
 */
export interface SimCognitoTokenOutput {
  readonly access_token: string;
  readonly id_token?: string | undefined;
  readonly refresh_token?: string | undefined;
  readonly token_type: string;
  readonly expires_in: number;
}

/**
 * The `/logout` query parameters this simulation reads.
 */
export interface SimCognitoLogoutInput {
  readonly client_id?: string | undefined;
  readonly logout_uri?: string | undefined;
  readonly redirect_uri?: string | undefined;
  readonly state?: string | undefined;
}
