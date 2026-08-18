import type { SimCognitoPageParameters } from "./sim-cognito-page-markup.js";

/**
 * The path the sign-in form is served at and posts back to.
 *
 * Real managed login serves its form at `/login` and sends the browser there
 * from `/oauth2/authorize`. Here the authorize endpoint answers with the form
 * itself, so an application's own authorize URL is the whole of what a test
 * has to know.
 */
export const simCognitoAuthorizePath = "/oauth2/authorize";

/**
 * The path the sign-up form is served at.
 */
export const simCognitoSignUpPath = "/signup";

/**
 * The path the confirmation form is served at.
 *
 * Real managed login confirms a sign-up on a page of `/signup` rather than at
 * a path of its own. This one is separate so that a browser can come back to
 * it with the code, and a test can reach it without replaying the sign-up.
 */
export const simCognitoConfirmPath = "/confirm";

/**
 * The path the form asking who has forgotten a password is served at.
 */
export const simCognitoForgotPasswordPath = "/forgotPassword";

/**
 * The path the form taking the reset code and the new password is served at.
 *
 * Real managed login serves both halves of a reset at these two paths, and
 * that is where an application's own links to them point.
 */
export const simCognitoResetPasswordPath = "/confirmForgotPassword";

/**
 * The pages served beside the OAuth endpoints.
 *
 * The sign-in form is not among them. It is what the authorize endpoint
 * answers with, so it has no path of its own.
 */
export const simCognitoPagePaths: ReadonlySet<string> = new Set([
  simCognitoSignUpPath,
  simCognitoConfirmPath,
  simCognitoForgotPasswordPath,
  simCognitoResetPasswordPath,
]);

/**
 * The authorize parameters every page carries on to the next.
 *
 * A sign-up ends in a sign-in, and that sign-in has to reach the app client's
 * callback URL with the `state` the application started with, so these travel
 * through each form as hidden inputs.
 */
const carriedNames = new Set([
  "response_type",
  "client_id",
  "redirect_uri",
  "state",
  "scope",
  "code_challenge",
  "code_challenge_method",
]);

/**
 * Whether a request signs in one of the pool's own users.
 *
 * A request naming no identity provider, or naming `COGNITO`, is the one
 * managed login answers with its own form, so a refusal from it is shown on
 * that form. One naming an external provider has no form to be shown on.
 */
export function simCognitoIsLocalSignIn(
  values: SimCognitoPageParameters,
): boolean {
  const named = values["identity_provider"] ?? values["idp_identifier"];

  return named === undefined || named === "COGNITO";
}

/**
 * The authorize parameters out of everything a request carried.
 *
 * A form post arrives holding these and the fields the form asked for, and a
 * page passes on only these, so nothing a person typed becomes part of the
 * next request's authorize parameters.
 */
export function simCognitoCarriedParameters(
  values: SimCognitoPageParameters,
): SimCognitoPageParameters {
  return Object.fromEntries(
    Object.entries(values).filter(([name]) => carriedNames.has(name)),
  );
}
