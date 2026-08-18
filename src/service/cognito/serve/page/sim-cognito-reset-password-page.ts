import { SimCognitoPageForm } from "./sim-cognito-page-form.js";
import { SimCognitoPageMarkup } from "./sim-cognito-page-markup.js";
import {
  simCognitoAuthorizePath,
  simCognitoResetPasswordPath,
} from "./sim-cognito-page-paths.js";

/**
 * The form that finishes a password reset, reached from the one that started
 * it.
 *
 * It takes the code the pool issued and the password the person has chosen,
 * and posts both to `ConfirmForgotPassword`. A wrong code and a password the
 * pool's policy turns down are both shown on the form, which is where the
 * person can do something about them.
 *
 * Nothing here delivers a code to anybody. The pool records the message it
 * would have sent, and `SimCognitoUserPool.confirmationCode` is where a test
 * reads it from, which is where a person would have read it out of an inbox.
 */
export class SimCognitoResetPasswordPage {
  private readonly markup = new SimCognitoPageMarkup();

  /**
   * The page, or the reset its form has just finished.
   */
  async handle(form: SimCognitoPageForm): Promise<Response> {
    if (!form.isPosted) {
      return this.render(form);
    }

    try {
      await form.cognito.confirmForgotPassword({
        input: {
          ClientId: form.clientId,
          Username: form.username,
          ConfirmationCode: form.field("code"),
          Password: form.field("password"),
          ...form.secretHash(),
        },
      });
    } catch (error) {
      return this.render(form, SimCognitoPageForm.messageIn(error));
    }

    // The user signs in with its new password at the endpoint the browser
    // arrived on, which is where the grant it started carries on from.
    return this.markup.redirect(simCognitoAuthorizePath, form.parameters);
  }

  /**
   * The page a browser is answered with, with a message where a reset has
   * already been refused once.
   */
  private render(form: SimCognitoPageForm, message?: string): Response {
    const { parameters, username } = form;

    // The page that started the reset names the user, and a browser that came
    // here from a link instead has to say who it is.
    const user =
      username === ""
        ? this.markup.field("username", "Username")
        : this.markup.hidden({ username });

    const body =
      (message === undefined ? "" : this.markup.message(message)) +
      this.markup.form(
        simCognitoResetPasswordPath,
        this.markup.hidden(parameters) +
          user +
          this.markup.field("code", "Reset code") +
          this.markup.field("password", "New password", "password") +
          this.markup.submit("reset", "Set the new password"),
      ) +
      this.markup.link(simCognitoAuthorizePath, parameters, "Back to sign in");

    return this.markup.page("Choose a new password", body);
  }
}
