import {
  isSimCognitoOAuthError,
  SimCognitoOAuthError,
} from "../error/sim-cognito-oauth.error.js";
import type { SimCognitoHostedRedirect } from "../command/hosted/hosted-auth.command.js";

/**
 * The responses a pool's hosted OAuth endpoints answer with.
 *
 * A hosted endpoint is answering a browser rather than an SDK client, so its
 * successes are redirects and its failures are either a redirect carrying an
 * error or a JSON body, which is the difference between an error the
 * application can be told about and one only the person in front of the
 * browser can see.
 */
export class SimCognitoOAuthResponse {
  /**
   * Read an error as an OAuth one, whatever it turned out to be.
   *
   * A refusal from further inside the simulation, such as an identity provider
   * with nobody signed in at it, is a server error to OAuth and its own
   * message to the reader, so the message is kept rather than replaced.
   */
  private static oauthError(error: unknown): SimCognitoOAuthError {
    if (isSimCognitoOAuthError(error)) {
      return error;
    }

    return new SimCognitoOAuthError({
      code: "invalid_request",
      description: this.describe(error),
      redirectable: false,
    });
  }

  private static describe(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "The request was refused";
  }

  /**
   * Send the browser on to where an endpoint decided it goes.
   */
  redirect(redirect: SimCognitoHostedRedirect): Response {
    return new Response(undefined, {
      status: 302,
      headers: { location: redirect.location },
    });
  }

  /**
   * Answer a token request with the tokens it asked for.
   *
   * The `Access-Control-Allow-Origin` header is the one real Cognito sets on
   * this endpoint, so a browser-based application completing a grant with PKCE
   * can read the answer.
   */
  tokens(body: object): Response {
    return Response.json(body, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  }

  /**
   * Answer a refused request to the authorize or logout endpoint.
   *
   * An error is sent back to the application's own URL where the request has
   * shown it knows one the app client registered, which is what real Cognito
   * does. Anything else is answered in the browser, because there is nowhere
   * trustworthy to send it.
   */
  refusedRedirect(
    error: unknown,
    redirectUri: string | undefined,
    state: string | undefined,
  ): Response {
    const oauthError = SimCognitoOAuthResponse.oauthError(error);

    if (redirectUri === undefined || !oauthError.redirectable) {
      return this.refusedRequest(oauthError);
    }

    const location = new URL(redirectUri);

    location.searchParams.set("error", oauthError.code);
    location.searchParams.set("error_description", oauthError.description);

    if (state !== undefined) {
      location.searchParams.set("state", state);
    }

    return new Response(undefined, {
      status: 302,
      headers: { location: location.href },
    });
  }

  /**
   * Answer a refused request in the shape the OAuth 2.0 specification gives an
   * error, which is what the token endpoint answers with and what a client
   * library reads.
   */
  refusedRequest(error: unknown): Response {
    const oauthError = SimCognitoOAuthResponse.oauthError(error);

    return Response.json(
      { error: oauthError.code, error_description: oauthError.description },
      { status: 400 },
    );
  }

  /**
   * Refuse a path the hosted domain serves nothing at.
   */
  noSuchEndpoint(pathname: string): Response {
    return Response.json(
      {
        error: "invalid_request",
        error_description:
          `A simulated user pool domain serves nothing at ${pathname}. It ` +
          `serves /oauth2/authorize, /oauth2/token and /logout.`,
      },
      { status: 404 },
    );
  }

  /**
   * Refuse a method an endpoint does not answer.
   */
  notAllowed(method: string, allowed: string): Response {
    return Response.json(
      {
        error: "invalid_request",
        error_description: `This endpoint answers ${allowed}, not ${method}`,
      },
      { status: 405, headers: { allow: allowed } },
    );
  }
}
