import { SimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCognitoHostedClient } from "./sim-cognito-hosted-client.js";
import type {
  SimCognitoHostedRedirect,
  SimCognitoLogoutInput,
} from "./hosted-auth.command.js";

/**
 * The `/logout` endpoint of a pool's hosted domain.
 *
 * Real Cognito ends the managed login session in the browser's cookie and
 * sends the user to one of the app client's sign-out URLs. There is no such
 * session here, because every authorize request signs in afresh at the
 * identity provider rather than reusing a cookie, so what is left is the
 * redirect and the check that the URL is one the app client registered.
 *
 * It signs nobody out at the identity provider either, which real Cognito also
 * does not do: a user signed out here is still signed in at Google.
 */
export class SimCognitoLogoutEndpoint {
  private readonly hostedClient = new SimCognitoHostedClient();

  /**
   * Send the browser to the application's sign-out page.
   */
  handle(
    pool: SimCognitoUserPool,
    input: SimCognitoLogoutInput,
  ): SimCognitoHostedRedirect {
    const client = this.hostedClient.forAuthorize(pool, input.client_id);
    const { logout_uri: logoutUri } = input;

    if (logoutUri === undefined) {
      throw new SimCognitoOAuthError({
        code: "invalid_request",
        description:
          "logout_uri is required here. A logout request without one sends " +
          "the user to managed login to sign in again, which is a page " +
          "rather than anything this simulation can answer.",
        redirectable: false,
      });
    }

    if (!client.oauth.allowsSignOutTo(logoutUri)) {
      throw new SimCognitoOAuthError({
        code: "invalid_request",
        description:
          `logout_uri '${logoutUri}' is not one of app client ${client.id}'s ` +
          `LogoutURLs`,
        redirectable: false,
      });
    }

    return { location: logoutUri };
  }
}
