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
