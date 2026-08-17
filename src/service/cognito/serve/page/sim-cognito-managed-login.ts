import { isSimCognitoManagedLoginRequired } from "../../error/sim-cognito-managed-login.error.js";
import { isSimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import type { SimCognitoDomainRequest } from "../sim-cognito-domain-request.js";
import { SimCognitoConfirmPage } from "./sim-cognito-confirm-page.js";
import { SimCognitoPageForm } from "./sim-cognito-page-form.js";
import type { SimCognitoPageParameters } from "./sim-cognito-page-markup.js";
import {
  simCognitoConfirmPath,
  simCognitoIsLocalSignIn,
  simCognitoSignUpPath,
} from "./sim-cognito-page-paths.js";
import { SimCognitoPageRequest } from "./sim-cognito-page-request.js";
import { SimCognitoSignInPage } from "./sim-cognito-sign-in-page.js";
import { SimCognitoSignUpPage } from "./sim-cognito-sign-up-page.js";

/**
 * The pages simulated managed login serves.
 *
 * A person reaches the sign-in form at the authorize endpoint, the sign-up
 * form from a link on it, and the confirmation form from the sign-up it has
 * just made. Each form carries the authorize request's own parameters through
 * as hidden inputs, so the sign-in at the end of it reaches the app client's
 * callback URL the application asked for.
 */
export class SimCognitoManagedLogin {
  private readonly pageRequest = new SimCognitoPageRequest();
  private readonly signInPage = new SimCognitoSignInPage();
  private readonly signUpPage = new SimCognitoSignUpPage();
  private readonly confirmPage = new SimCognitoConfirmPage();

  /**
   * Whether a path is one of the two pages served beside the OAuth endpoints.
   */
  static servesPage(pathname: string): boolean {
    return (
      pathname === simCognitoSignUpPath || pathname === simCognitoConfirmPath
    );
  }

  /**
   * Answer the sign-up or confirmation page a request reached.
   */
  async handlePage(request: SimCognitoDomainRequest): Promise<Response> {
    const form = this.formIn(request);

    if (request.url.pathname === simCognitoSignUpPath) {
      return await this.signUpPage.handle(form);
    }

    return await this.confirmPage.handle(form);
  }

  /**
   * Answer a refused authorize request on the sign-in form, where the form is
   * what real managed login would have answered with.
   *
   * A request carrying no credentials gets the empty form. One the person
   * filled in wrongly gets it back with the refusal on it, because a wrong
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
