import { SimCognitoPageForm } from "./sim-cognito-page-form.js";
import { SimCognitoPageMarkup } from "./sim-cognito-page-markup.js";
import {
  simCognitoAuthorizePath,
  simCognitoForgotPasswordPath,
  simCognitoResetPasswordPath,
} from "./sim-cognito-page-paths.js";

/**
 * The form that starts a password reset, reached from a link on the sign-in
 * page.
 *
 * It asks who has forgotten the password and posts that to `ForgotPassword`,
 * which is what an application with its own sign-in screens calls. The browser
 * goes on to the page that takes the code.
 *
 * What an unknown user sees is the app client's `PreventUserExistenceErrors`
 * decision. A client that hides existence sends the browser to the next page
 * either way, and one on the `LEGACY` default says the user is not there.
 */
export class SimCognitoForgotPasswordPage {
  private readonly markup = new SimCognitoPageMarkup();

  /**
   * The page, or the reset its form has just started.
   */
  async handle(form: SimCognitoPageForm): Promise<Response> {
    if (!form.isPosted) {
      return this.render(form);
    }

    try {
      await form.cognito.forgotPassword({
        input: {
          ClientId: form.clientId,
          Username: form.username,
          ...form.secretHash(),
        },
      });
    } catch (error) {
      return this.render(form, SimCognitoPageForm.messageIn(error));
    }

    return this.markup.redirect(simCognitoResetPasswordPath, {
      ...form.parameters,
      username: form.username,
    });
  }

  /**
   * The page a browser is answered with, with a message where a reset has
   * already been refused once.
   */
  private render(form: SimCognitoPageForm, message?: string): Response {
    const { parameters } = form;
    const body =
      (message === undefined ? "" : this.markup.message(message)) +
      this.markup.form(
        simCognitoForgotPasswordPath,
        this.markup.hidden(parameters) +
          this.markup.field("username", "Username") +
          this.markup.submit("reset", "Send a reset code"),
      ) +
      this.markup.link(
        simCognitoResetPasswordPath,
        parameters,
        "I already have a code",
      ) +
      this.markup.link(simCognitoAuthorizePath, parameters, "Back to sign in");

    return this.markup.page("Forgotten your password", body);
  }
}
