import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import {
  SimCognitoPageMarkup,
  type SimCognitoPageParameters,
} from "./sim-cognito-page-markup.js";
import {
  simCognitoAuthorizePath,
  simCognitoConfirmPath,
  simCognitoSignUpPath,
} from "./sim-cognito-page-paths.js";

/**
 * The sign-in form managed login answers an authorize request with.
 *
 * The form posts back to the authorize endpoint, carrying the parameters the
 * browser arrived on as hidden inputs and the two fields the person filled in.
 * The pool's identity providers are links to the same endpoint with
 * `identity_provider` set, so both ways in are reachable from this one page.
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
      this.providerLinks(pool, parameters) +
      this.markup.link(simCognitoSignUpPath, parameters, "Sign up") +
      this.markup.link(simCognitoConfirmPath, parameters, "Confirm a sign-up");

    return this.markup.page("Sign in", body);
  }

  /**
   * One link per identity provider the pool has, each starting the federated
   * sign-in this endpoint already answers.
   */
  private providerLinks(
    pool: SimCognitoUserPool,
    parameters: SimCognitoPageParameters,
  ): string {
    return pool.auth.identityProviders.all
      .map((provider) =>
        this.markup.link(
          simCognitoAuthorizePath,
          { ...parameters, identity_provider: provider.name },
          `Sign in with ${provider.name}`,
        ),
      )
      .join("");
  }
}
