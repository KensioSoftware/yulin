import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoAttributeType } from "../../user-pool/user/sim-cognito-user-attributes.js";
import { SimCognitoPageForm } from "./sim-cognito-page-form.js";
import { SimCognitoPageMarkup } from "./sim-cognito-page-markup.js";
import {
  simCognitoAuthorizePath,
  simCognitoConfirmPath,
  simCognitoSignUpPath,
} from "./sim-cognito-page-paths.js";

/**
 * The sign-up form, reached from a link on the sign-in page.
 *
 * The form asks for a username, a password and the attributes the pool needs
 * of a new user. Those are the ones its `Schema` made required, and the ones
 * its `AutoVerifiedAttributes` names, because the second is where the
 * confirmation code would have been delivered.
 *
 * Posting it is `SignUp`, called as an application calls it. A refusal is
 * shown on the form, which is what managed login does with a password the
 * pool's policy turns down.
 */
export class SimCognitoSignUpPage {
  private readonly markup = new SimCognitoPageMarkup();

  /**
   * The attributes this pool's sign-up form asks for.
   */
  static attributeNames(pool: SimCognitoUserPool): readonly string[] {
    const { schema, autoVerifiedAttributes, usernameAttributes } =
      pool.settings;
    const asked = new Set([
      ...schema.requiredNames,
      ...autoVerifiedAttributes.names,
    ]);

    // A pool signing users in by an address takes that address as the
    // username, so asking for it again would be asking the same question
    // twice.
    return [...asked.difference(new Set(usernameAttributes.names))];
  }

  /**
   * The attributes the form asked for, as `SignUp` takes them.
   */
  private static attributesIn(
    form: SimCognitoPageForm,
  ): SimCognitoAttributeType[] {
    return this.attributeNames(form.pool)
      .map((name) => ({ Name: name, Value: form.field(name) }))
      .filter((attribute) => (attribute.Value ?? "") !== "");
  }

  /**
   * The page, or the sign-up its form has just posted.
   */
  async handle(form: SimCognitoPageForm): Promise<Response> {
    if (!form.isPosted) {
      return this.render(form);
    }

    try {
      await form.cognito.signUp({
        input: {
          ClientId: form.clientId,
          Username: form.username,
          Password: form.field("password"),
          UserAttributes: SimCognitoSignUpPage.attributesIn(form),
          ...form.secretHash(),
        },
      });
    } catch (error) {
      return this.render(form, SimCognitoPageForm.messageIn(error));
    }

    return this.markup.redirect(simCognitoConfirmPath, {
      ...form.parameters,
      username: form.username,
    });
  }

  /**
   * The page a browser is answered with, with a message where a sign-up has
   * already been refused once.
   */
  private render(form: SimCognitoPageForm, message?: string): Response {
    const { parameters } = form;
    const attributes = SimCognitoSignUpPage.attributeNames(form.pool)
      .map((name) => this.markup.field(name, name))
      .join("");

    const body =
      (message === undefined ? "" : this.markup.message(message)) +
      this.markup.form(
        simCognitoSignUpPath,
        this.markup.hidden(parameters) +
          this.markup.field("username", "Username") +
          this.markup.field("password", "Password", "password") +
          attributes +
          this.markup.submit("signUp", "Sign up"),
      ) +
      this.markup.link(simCognitoAuthorizePath, parameters, "Back to sign in");

    return this.markup.page("Sign up", body);
  }
}
