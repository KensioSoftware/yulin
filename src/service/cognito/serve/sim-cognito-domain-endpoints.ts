import { SimCognitoManagedLogin } from "./page/sim-cognito-managed-login.js";
import type { SimCognitoPageParameters } from "./page/sim-cognito-page-markup.js";
import { simCognitoAuthorizePath } from "./page/sim-cognito-page-paths.js";
import { SimCognitoPageRequest } from "./page/sim-cognito-page-request.js";
import type { SimCognitoDomainRequest } from "./sim-cognito-domain-request.js";
import { SimCognitoOAuthResponse } from "./sim-cognito-oauth-response.js";
import { SimCognitoTokenRequest } from "./sim-cognito-token-request.js";

/**
 * The remaining paths a hosted domain serves.
 */
const tokenPath = "/oauth2/token";
const logoutPath = "/logout";

/**
 * The methods a page takes, which is both of them, because a form is fetched
 * and then posted back.
 */
const pageMethods = "GET, POST";

export type { SimCognitoDomainRequest } from "./sim-cognito-domain-request.js";

/**
 * The endpoints and pages a pool's hosted domain serves.
 *
 * The token and logout endpoints take one HTTP method each, as real Cognito's
 * do. The authorize endpoint takes the post of the sign-in form it serves as
 * well as the get an application sends the browser on, and so do the two pages
 * reached from that form.
 */
export class SimCognitoDomainEndpoints {
  private readonly response = new SimCognitoOAuthResponse();
  private readonly tokenRequest = new SimCognitoTokenRequest();
  private readonly pageRequest = new SimCognitoPageRequest();
  private readonly pages = new SimCognitoManagedLogin();

  /**
   * Answer a request that reached the domain's hostname.
   */
  async handleRequest(request: SimCognitoDomainRequest): Promise<Response> {
    const { pathname } = request.url;

    if (pathname === simCognitoAuthorizePath) {
      return await this.authorize(request);
    }

    if (pathname === tokenPath) {
      return await this.token(request);
    }

    if (pathname === logoutPath) {
      return await this.logout(request);
    }

    if (SimCognitoManagedLogin.servesPage(pathname)) {
      return await this.answered(request, pageMethods, async () =>
        this.pages.handlePage(request),
      );
    }

    return this.response.noSuchEndpoint(pathname);
  }

  /**
   * Sign a user in and send the browser back to the application with a code,
   * or serve the form that asks who is signing in.
   *
   * A get carrying credentials and a post of the sign-in form are the same
   * request to the simulation. Both name the user and its password, and the
   * only difference is where those two were read from.
   */
  private async authorize(request: SimCognitoDomainRequest): Promise<Response> {
    return await this.answered(request, pageMethods, async () => {
      const parameters = this.pageRequest.values(
        request.serviceRequest,
        request.url,
      );

      try {
        return this.response.redirect(
          await request.cognito.hostedAuthorize(request.pool, parameters),
        );
      } catch (error) {
        return this.refused(request, parameters, error);
      }
    });
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

  /**
   * Exchange an authorization code or a refresh token for tokens.
   */
  private async token(request: SimCognitoDomainRequest): Promise<Response> {
    return await this.answered(request, "POST", async () => {
      try {
        return this.response.tokens(
          await request.cognito.hostedToken(
            request.pool,
            this.tokenRequest.read(request.serviceRequest),
          ),
        );
      } catch (error) {
        return this.response.refusedRequest(error);
      }
    });
  }

  /**
   * Send the browser to the application's sign-out page.
   */
  private async logout(request: SimCognitoDomainRequest): Promise<Response> {
    const parameters = Object.fromEntries(request.url.searchParams);

    return await this.answered(request, "GET", async () => {
      try {
        return this.response.redirect(
          await request.cognito.hostedSignOut(request.pool, parameters),
        );
      } catch (error) {
        return this.response.refusedRequest(error);
      }
    });
  }

  /**
   * Answer a request that used a method its endpoint takes.
   */
  private async answered(
    request: SimCognitoDomainRequest,
    allowed: string,
    answer: () => Promise<Response>,
  ): Promise<Response> {
    const requested = request.serviceRequest.request.method;

    if (!allowed.split(", ").includes(requested)) {
      return this.response.notAllowed(requested, allowed);
    }

    return await answer();
  }
}
