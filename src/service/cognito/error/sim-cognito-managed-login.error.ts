import { SimCognitoOAuthError } from "./sim-cognito-oauth.error.js";

/**
 * An authorize request that a person still has to fill a form in for.
 *
 * Real Cognito answers this request with managed login's sign-in form. The
 * serving layer answers it with the simulation's own form, and a caller
 * reaching `hostedAuthorize` without going through HTTP is answered with this
 * refusal, which says which two fields the form would have posted.
 *
 * It is an OAuth error so that every other caller treats it as one. The
 * serving layer is the only thing that tells it apart, because the serving
 * layer is the only thing that can answer with a page.
 */
export class SimCognitoManagedLoginRequired extends SimCognitoOAuthError {
  constructor() {
    super({
      code: "invalid_request",
      description:
        "This request names no identity provider, so it signs in one of " +
        "the pool's own users and needs a username and a password. Pass " +
        "both, or name an identity_provider to sign in through.",
      redirectable: false,
    });
  }
}

/**
 * Whether an authorize request was one managed login would have answered with
 * its sign-in form.
 */
export function isSimCognitoManagedLoginRequired(
  error: unknown,
): error is SimCognitoManagedLoginRequired {
  return error instanceof SimCognitoManagedLoginRequired;
}

/**
 * An authorize request that has been asked for a passkey and has yet to
 * present one.
 *
 * Real managed login runs the WebAuthn ceremony in the browser at this point,
 * with the person's own authenticator, and posts the credential back. These
 * pages serve no script, so the serving layer answers with a page carrying the
 * challenge, and whatever holds the passkey presents it in the next request.
 *
 * The session is the challenge the pool issued, and the credential coming back
 * has to have signed it.
 */
export class SimCognitoPasskeyRequired extends SimCognitoOAuthError {
  /** The user the challenge was issued for. */
  public readonly username: string;

  /** The challenge session a credential answers. */
  public readonly session: string;

  constructor(username: string, session: string) {
    super({
      code: "invalid_request",
      description:
        "This request asked to sign in with a passkey, so the pool has " +
        "issued a challenge and needs the credential answering it. Read the " +
        "credential off the pool with SimCognitoUserPool.webAuthnAssertion, " +
        "and post it back as credential with the passkey_session it answers.",
      redirectable: false,
    });
    this.username = username;
    this.session = session;
  }
}

/**
 * Whether an authorize request was one managed login would have asked for a
 * passkey on.
 */
export function isSimCognitoPasskeyRequired(
  error: unknown,
): error is SimCognitoPasskeyRequired {
  return error instanceof SimCognitoPasskeyRequired;
}
