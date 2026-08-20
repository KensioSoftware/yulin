import { SimCognitoManagedLogin } from "./page/sim-cognito-managed-login.js";
import type { SimCognitoPageParameters } from "./page/sim-cognito-page-markup.js";
import { SimCognitoPageRequest } from "./page/sim-cognito-page-request.js";
import type { SimCognitoDomainRequest } from "./sim-cognito-domain-request.js";
import { SimCognitoOAuthResponse } from "./sim-cognito-oauth-response.js";
import { SimCognitoSessionCookie } from "./sim-cognito-session-cookie.js";

/**
 * What a served `/oauth2/authorize` request is answered with.
 *
 * Three requests reach this one path. An application sends the browser here to
 * start a sign-in, the sign-in form posts back here to finish one, and a
 * browser holding a managed login session arrives here and is signed in
 * without being asked anything. They are one endpoint because real Cognito
 * serves them as one, and the parameters are read the same way whichever
 * arrived.
 */
export class SimCognitoAuthorizeRoute {
  private readonly response = new SimCognitoOAuthResponse();
  private readonly pageRequest = new SimCognitoPageRequest();
  private readonly pages = new SimCognitoManagedLogin();
  private readonly sessionCookie = new SimCognitoSessionCookie();

  /**
   * Sign a user in and send the browser back to the application with a code,
   * or serve the form that asks who is signing in.
   */
  async handle(request: SimCognitoDomainRequest): Promise<Response> {
    const parameters = this.pageRequest.values(
      request.serviceRequest,
      request.url,
    );

    try {
      return this.response.redirect(
        await request.cognito.hostedAuthorize(
          request.pool,
          parameters,
          this.sessionCookie.read(request.serviceRequest.request),
        ),
      );
    } catch (error) {
      return this.refused(request, parameters, error);
    }
  }

  /**
   * Answer a refused sign-in, on the form or at the application.
   */
  private refused(
    request: SimCognitoDomainRequest,
    parameters: SimCognitoPageParameters,
    error: unknown,
  ): Response {
    return (
      this.pages.refusedSignIn(request, parameters, error) ??
      this.response.refusedRedirect(
        error,
        parameters["redirect_uri"],
        parameters["state"],
      )
    );
  }
}
