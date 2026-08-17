import { SimCognitoPageForm } from "./sim-cognito-page-form.js";
import { SimCognitoPageMarkup } from "./sim-cognito-page-markup.js";
import {
  simCognitoAuthorizePath,
  simCognitoConfirmPath,
} from "./sim-cognito-page-paths.js";

/**
 * The name of the button that asks for another confirmation code.
 *
 * The form has two submit buttons, and this is what tells the post which one
 * was pressed.
 */
const resendField = "resend";

/**
 * The confirmation form, reached from the sign-up that has just been made.
 *
 * It takes the code the pool issued and confirms the sign-up with it, which is
 * `ConfirmSignUp`. The second button is `ResendConfirmationCode`, and the code
 * the user was holding stops working when it is pressed.
 *
 * Nothing here delivers a code to anybody. The pool records the message it
 * would have sent, and `SimCognitoUserPool.confirmationCode` is where a test
 * reads it from, which is where a person would have read it out of an inbox.
 */
export class SimCognitoConfirmPage {
  private readonly markup = new SimCognitoPageMarkup();

  /**
   * The page, or one of the two operations its form has just posted.
   */
  async handle(form: SimCognitoPageForm): Promise<Response> {
    if (!form.isPosted) {
      return this.render(form);
    }

    if (form.field(resendField) !== undefined) {
      return await this.resend(form);
    }

    try {
      await form.cognito.confirmSignUp({
        input: {
          ClientId: form.clientId,
          Username: form.username,
          ConfirmationCode: form.field("code"),
          ...form.secretHash(),
        },
      });
    } catch (error) {
      return this.render(form, SimCognitoPageForm.messageIn(error));
    }

    // The confirmed user signs in at the endpoint the browser arrived on,
    // which is where the grant it started carries on from.
    return this.markup.redirect(simCognitoAuthorizePath, form.parameters);
  }

  /**
   * Issue a fresh confirmation code, and ask for it again.
   */
  private async resend(form: SimCognitoPageForm): Promise<Response> {
    try {
      await form.cognito.resendConfirmationCode({
        input: {
          ClientId: form.clientId,
          Username: form.username,
          ...form.secretHash(),
        },
      });
    } catch (error) {
      return this.render(form, SimCognitoPageForm.messageIn(error));
    }

    return this.render(form, "Another code has been sent.");
  }

  /**
   * The page a browser is answered with, with a message where a confirmation
   * has already been refused once or a fresh code has just been sent.
   */
  private render(form: SimCognitoPageForm, message?: string): Response {
    const { parameters } = form;
    const body =
      (message === undefined ? "" : this.markup.message(message)) +
      this.markup.form(
        simCognitoConfirmPath,
        this.markup.hidden({ ...parameters, username: form.username }) +
          this.markup.field("code", "Confirmation code") +
          this.markup.submit("confirm", "Confirm") +
          this.markup.submit(resendField, "Send another code"),
      ) +
      this.markup.link(simCognitoAuthorizePath, parameters, "Back to sign in");

    return this.markup.page("Confirm your sign-up", body);
  }
}
