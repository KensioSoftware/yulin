import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import {
  SimCognitoPageMarkup,
  type SimCognitoPageParameters,
} from "./sim-cognito-page-markup.js";
import {
  simCognitoAuthorizePath,
  simCognitoConfirmPath,
  simCognitoForgotPasswordPath,
  simCognitoSignUpPath,
} from "./sim-cognito-page-paths.js";
import { simCognitoProviderLinks } from "./sim-cognito-provider-links.js";

/**
 * The other pages the sign-in form links to, in the order they are offered.
 */
const linkedPages: readonly (readonly [string, string])[] = [
  [simCognitoSignUpPath, "Sign up"],
  [simCognitoConfirmPath, "Confirm a sign-up"],
  [simCognitoForgotPasswordPath, "Forgotten your password?"],
];

/**
 * The sign-in form managed login answers an authorize request with.
 *
 * The form posts back to the authorize endpoint, carrying the parameters the
 * browser arrived on as hidden inputs and the two fields the person filled in.
 * The pool's identity providers are links to the same endpoint with
 * `identity_provider` set, so both ways in are reachable from this one page,
 * and the other pages of the journey are links beside them.
 */
export class SimCognitoSignInPage {
  private readonly markup = new SimCognitoPageMarkup();

  /**
   * The page a browser is answered with, with a message where a sign-in has
   * already been refused once.
   */
  render(
    pool: SimCognitoUserPool,
    parameters: SimCognitoPageParameters,
    message?: string,
  ): Response {
    const body =
      (message === undefined ? "" : this.markup.message(message)) +
      this.markup.form(
        simCognitoAuthorizePath,
        this.markup.hidden(parameters) +
          this.markup.field("username", "Username") +
          this.markup.field("password", "Password", "password") +
          this.markup.submit("signIn", "Sign in"),
      ) +
      simCognitoProviderLinks(this.markup, pool, parameters) +
      linkedPages
        .map(([path, text]) => this.markup.link(path, parameters, text))
        .join("");

    return this.markup.page("Sign in", body);
  }
}
