import { SimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";

/**
 * Resolves the app client a request to a hosted endpoint names.
 *
 * The two endpoints refuse an unknown client differently, because they are
 * answering different callers: the authorize endpoint is answering a browser
 * and says the request was bad, and the token endpoint is answering an
 * application and says its client authentication failed.
 */
export class SimCognitoHostedClient {
  /**
   * The app client an authorize request names, or a refusal the browser sees.
   *
   * Nothing is redirected here. The request has not yet shown that it knows a
   * redirect URI this client registered, so sending the error to the URI it
   * asked for would send it anywhere it liked.
   */
  forAuthorize(
    pool: SimCognitoUserPool,
    clientId: string | undefined,
  ): SimCognitoUserPoolClient {
    const client = this.find(pool, clientId);

    if (client === undefined) {
      throw new SimCognitoOAuthError({
        code: "invalid_request",
        description:
          `client_id '${String(clientId)}' is not an app client of user ` +
          `pool ${pool.id}`,
        redirectable: false,
      });
    }

    return client;
  }

  /**
   * The app client a token request names, having authenticated it.
   *
   * A client with a secret has to present it, either in the body or in a basic
   * authorization header. A public client has none to present, and presenting
   * one for it fails rather than being ignored: the request believes it is
   * talking to a client that does not exist.
   */
  forToken(
    pool: SimCognitoUserPool,
    clientId: string | undefined,
    clientSecret: string | undefined,
  ): SimCognitoUserPoolClient {
    const client = this.find(pool, clientId);

    if (client === undefined || client.secret !== clientSecret) {
      throw new SimCognitoOAuthError({
        code: "invalid_client",
        description:
          "The app client this request authenticated as does not exist, or " +
          "its client secret is not the one it was given",
        redirectable: false,
      });
    }

    return client;
  }

  /**
   * The URI the browser is sent back to.
   *
   * A request naming none is sent to the app client's `DefaultRedirectURI`,
   * which is what real Cognito falls back to. One naming a URI the client did
   * not register is refused without redirecting anywhere, because that URI is
   * exactly what cannot be trusted.
   */
  requiredRedirectUri(
    client: SimCognitoUserPoolClient,
    requested: string | undefined,
  ): string {
    const redirectUri = requested ?? client.oauth.defaultRedirectUri;

    if (
      redirectUri === undefined ||
      !client.oauth.allowsRedirectTo(redirectUri)
    ) {
      throw new SimCognitoOAuthError({
        code: "invalid_request",
        description:
          `redirect_uri '${String(redirectUri)}' is not one of app client ` +
          `${client.id}'s CallbackURLs`,
        redirectable: false,
      });
    }

    return redirectUri;
  }

  /**
   * Refuse a client that cannot complete an authorization code grant.
   *
   * A client is only an authorization server client once
   * `AllowedOAuthFlowsUserPoolClient` is true and `code` is among its
   * `AllowedOAuthFlows`, so one configured for the API alone is refused at the
   * hosted endpoints, as it is on real Cognito.
   */
  requireCodeGrant(
    client: SimCognitoUserPoolClient,
    redirectable: boolean,
  ): void {
    if (client.oauth.allowsCodeGrant) {
      return;
    }

    throw new SimCognitoOAuthError({
      code: "unauthorized_client",
      description:
        `App client ${client.id} is not allowed the authorization code ` +
        `grant: set AllowedOAuthFlowsUserPoolClient and an AllowedOAuthFlows ` +
        `of 'code' on it`,
      redirectable,
    });
  }

  private find(
    pool: SimCognitoUserPool,
    clientId: string | undefined,
  ): SimCognitoUserPoolClient | undefined {
    if (clientId === undefined || clientId === "") {
      return undefined;
    }

    return pool.findClient(clientId);
  }
}
