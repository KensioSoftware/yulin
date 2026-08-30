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

  /**
   * Whether the person pressed managed login's passkey button rather than
   * filling in a password.
   *
   * The pool answers that with a challenge, and the credential answering it
   * comes back in the next request.
   */
  readonly passkey?: string | undefined;

  /**
   * The credential a passkey was presented as, which is the JSON a browser
   * serializes a `PublicKeyCredential` to.
   *
   * Real managed login collects this in the browser, from the person's own
   * authenticator. These pages serve no script, so the form asks for it and
   * `SimCognitoUserPool.webAuthnAssertion` is where a test reads it from.
   */
  readonly credential?: string | undefined;

  /**
   * The challenge session the presented credential answers, which the pool
   * issued when the passkey was asked for.
   */
  readonly passkey_session?: string | undefined;

  /**
   * The subject the identity provider is signing in, as the stand-in page for
   * that provider posted it.
   *
   * Real Cognito redirects the browser to the provider itself here, and the
   * provider answers with whoever signed in at it. A test says who that is
   * with `signInAs`, and a browser on a served domain says it on the page the
   * simulation stands in with. This is that page coming back.
   */
  readonly subject?: string | undefined;

  /**
   * One claim the provider would have asserted, under its own claim name.
   *
   * The stand-in page draws a field per claim the provider's `AttributeMapping`
   * reads, so the names are the pool's rather than this simulation's, and they
   * are prefixed to keep them apart from the authorize parameters they are
   * posted beside.
   */
  readonly [claim: `claim_${string}`]: string | undefined;
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
