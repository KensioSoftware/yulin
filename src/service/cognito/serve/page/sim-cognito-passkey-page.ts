import {
  SimCognitoPageMarkup,
  type SimCognitoPageParameters,
} from "./sim-cognito-page-markup.js";
import { simCognitoAuthorizePath } from "./sim-cognito-page-paths.js";

/**
 * What a browser is asked for once it has said it will sign in with a passkey.
 *
 * Real managed login runs the WebAuthn ceremony here, in the browser, with the
 * person's own authenticator, and posts the credential back without asking
 * anybody anything. These pages serve no script, so the ceremony is a field on
 * a form. A test reads what the authenticator would have produced off the pool
 * with `SimCognitoUserPool.webAuthnAssertion`, passing the session this page
 * carries, and posts it back.
 *
 * The form posts to the authorize endpoint, as the sign-in form does, carrying
 * the parameters the browser arrived on and the challenge the pool issued.
 */
export class SimCognitoPasskeyPage {
  private readonly markup = new SimCognitoPageMarkup();

  /**
   * The page a browser is answered with, naming the challenge a passkey has to
   * answer.
   */
  render(
    parameters: SimCognitoPageParameters,
    username: string,
    session: string,
  ): Response {
    const body =
      this.markup.message(
        `Present the passkey registered for ${username}, as the credential ` +
          `answering this challenge.`,
      ) +
      this.markup.form(
        simCognitoAuthorizePath,
        this.markup.hidden({
          ...parameters,
          username,
          passkey_session: session,
        }) +
          this.markup.field("credential", "Credential") +
          this.markup.submit("present", "Sign in"),
      ) +
      this.markup.link(simCognitoAuthorizePath, parameters, "Back to sign in");

    return this.markup.page("Present your passkey", body);
  }
}
