import {
  isSimCognitoManagedLoginRequired,
  isSimCognitoPasskeyRequired,
} from "../../error/sim-cognito-managed-login.error.js";
import { isSimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import type { SimCognitoDomainRequest } from "../sim-cognito-domain-request.js";
import { SimCognitoConfirmPage } from "./sim-cognito-confirm-page.js";
import { SimCognitoForgotPasswordPage } from "./sim-cognito-forgot-password-page.js";
import { SimCognitoPageForm } from "./sim-cognito-page-form.js";
import { SimCognitoPasskeyPage } from "./sim-cognito-passkey-page.js";
import type { SimCognitoPageParameters } from "./sim-cognito-page-markup.js";
import {
  simCognitoForgotPasswordPath,
  simCognitoIsLocalSignIn,
  simCognitoPagePaths,
  simCognitoResetPasswordPath,
  simCognitoSignUpPath,
} from "./sim-cognito-page-paths.js";
import { SimCognitoResetPasswordPage } from "./sim-cognito-reset-password-page.js";
import { SimCognitoPageRequest } from "./sim-cognito-page-request.js";
import { SimCognitoSignInPage } from "./sim-cognito-sign-in-page.js";
import { SimCognitoSignUpPage } from "./sim-cognito-sign-up-page.js";

/**
 * The pages simulated managed login serves.
 *
 * A person reaches the sign-in form at the authorize endpoint, the sign-up
 * form and the forgotten password form from links on it, and the confirmation
 * and new password forms from the step before each. Each form carries the
 * authorize request's own parameters through as hidden inputs, so the sign-in
 * at the end of it reaches the app client's callback URL the application asked
 * for.
 */
export class SimCognitoManagedLogin {
  private readonly pageRequest = new SimCognitoPageRequest();
  private readonly signInPage = new SimCognitoSignInPage();
  private readonly passkeyPage = new SimCognitoPasskeyPage();
  private readonly signUpPage = new SimCognitoSignUpPage();
  private readonly confirmPage = new SimCognitoConfirmPage();
  private readonly forgotPasswordPage = new SimCognitoForgotPasswordPage();
  private readonly resetPasswordPage = new SimCognitoResetPasswordPage();

  /**
   * Whether a path is one of the pages served beside the OAuth endpoints.
   */
  static servesPage(pathname: string): boolean {
    return simCognitoPagePaths.has(pathname);
  }

  /**
   * Answer the page a request reached.
   */
  async handlePage(request: SimCognitoDomainRequest): Promise<Response> {
    const form = this.formIn(request);

    switch (request.url.pathname) {
      case simCognitoSignUpPath: {
        return await this.signUpPage.handle(form);
      }
      case simCognitoForgotPasswordPath: {
        return await this.forgotPasswordPage.handle(form);
      }
      case simCognitoResetPasswordPath: {
        return await this.resetPasswordPage.handle(form);
      }
      default: {
        return await this.confirmPage.handle(form);
      }
    }
  }

  /**
   * Answer a refused authorize request on the sign-in form, where the form is
   * what real managed login would have answered with.
   *
   * A request carrying no credentials gets the empty form. One asking for a
   * passkey gets the page that asks for the credential. One the person filled
   * in wrongly gets the form back with the refusal on it, because a wrong
   * password is theirs to correct rather than the application's to be told
   * about. Every other refusal belongs to the application, and nothing here
   * answers it.
   */
  refusedSignIn(
    request: SimCognitoDomainRequest,
    parameters: SimCognitoPageParameters,
    error: unknown,
  ): Response | undefined {
    if (isSimCognitoManagedLoginRequired(error)) {
      return this.signInPage.render(request.pool, parameters);
    }

    if (isSimCognitoPasskeyRequired(error)) {
      return this.passkeyPage.render(parameters, error.username, error.session);
    }

    if (isSimCognitoOAuthError(error) || !simCognitoIsLocalSignIn(parameters)) {
      return undefined;
    }

    return this.signInPage.render(
      request.pool,
      parameters,
      SimCognitoPageForm.messageIn(error),
    );
  }

  private formIn(request: SimCognitoDomainRequest): SimCognitoPageForm {
    return new SimCognitoPageForm(
      request,
      this.pageRequest.values(request.serviceRequest, request.url),
    );
  }
}
