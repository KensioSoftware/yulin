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

/**
 * An authorize request naming an identity provider that nobody is signed in
 * at, and presenting no user of its own.
 *
 * Real Cognito redirects the browser to the provider's own sign-in page here,
 * and the provider answers with whoever signed in at it. Nothing in this
 * simulation calls a provider, so a served domain answers with a page standing
 * in for that one, and the person says who is signing in. A test skips the
 * page by saying it with `signInAs` first.
 *
 * It is an OAuth error so that every other caller treats it as one, in the
 * same way `SimCognitoManagedLoginRequired` is.
 */
export class SimCognitoProviderSignInRequired extends SimCognitoOAuthError {
  /** The provider the page stands in for. */
  public readonly providerName: string;

  constructor(providerName: string) {
    super({
      code: "invalid_request",
      description:
        `Nobody is signed in at the ${providerName} identity provider. Real ` +
        `Cognito would send the user to the provider's own sign-in page, ` +
        `which this simulation has no equivalent of. Say who is signed in ` +
        `there with signInAs, or post a subject to the page a served domain ` +
        `answers this request with.`,
      redirectable: false,
    });
    this.providerName = providerName;
  }
}

/**
 * Whether an authorize request was one a provider's own sign-in page would
 * have answered.
 */
export function isSimCognitoProviderSignInRequired(
  error: unknown,
): error is SimCognitoProviderSignInRequired {
  return error instanceof SimCognitoProviderSignInRequired;
}
