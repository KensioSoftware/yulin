import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import { SimCognitoOAuthResponse } from "./sim-cognito-oauth-response.js";
import { SimCognitoTokenRequest } from "./sim-cognito-token-request.js";

/**
 * The paths a hosted domain serves.
 */
const authorizePath = "/oauth2/authorize";
const tokenPath = "/oauth2/token";
const logoutPath = "/logout";

/**
 * One request to a hosted domain, and what answers it.
 */
export interface SimCognitoDomainRequest {
  readonly pool: SimCognitoUserPool;

  /** The simulated Cognito scope the pool belongs to. */
  readonly cognito: SimCognitoIdentityProvider;
  readonly serviceRequest: SimAwsServiceRequest;
  readonly url: URL;
}

/**
 * The three endpoints a pool's hosted domain serves.
 *
 * Each takes one HTTP method and one only, as real Cognito's do, and turns
 * what the simulation answered into the redirect or the JSON body a browser or
 * an application's own server reads.
 */
export class SimCognitoDomainEndpoints {
  private readonly response = new SimCognitoOAuthResponse();
  private readonly tokenRequest = new SimCognitoTokenRequest();

  /**
   * Answer a request that reached the domain's hostname.
   */
  async handleRequest(request: SimCognitoDomainRequest): Promise<Response> {
    const { pathname } = request.url;

    if (pathname === authorizePath) {
      return await this.authorize(request);
    }

    if (pathname === tokenPath) {
      return await this.token(request);
    }

    if (pathname === logoutPath) {
      return await this.logout(request);
    }

    return this.response.noSuchEndpoint(pathname);
  }

  /**
   * Sign a user in through an identity provider and send the browser back to
   * the application with a code.
   */
  private async authorize(request: SimCognitoDomainRequest): Promise<Response> {
    const parameters = Object.fromEntries(request.url.searchParams);

    return await this.answered(request, "GET", async () => {
      try {
        return this.response.redirect(
          await request.cognito.hostedAuthorize(request.pool, parameters),
        );
      } catch (error) {
        return this.response.refusedRedirect(
          error,
          parameters["redirect_uri"],
          parameters["state"],
        );
      }
    });
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
   * Answer a request that used the method its endpoint takes.
   *
   * Each endpoint takes one method and one only, as real Cognito's do, so what
   * is left to say about any other is which one it was.
   */
  private async answered(
    request: SimCognitoDomainRequest,
    method: string,
    answer: () => Promise<Response>,
  ): Promise<Response> {
    const requested = request.serviceRequest.request.method;

    if (requested !== method) {
      return this.response.notAllowed(requested, method);
    }

    return await answer();
  }
}
