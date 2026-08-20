import { SimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCognitoHostedClient } from "./sim-cognito-hosted-client.js";
import { SimCognitoSessionChange } from "./sim-cognito-session-change.js";
import type {
  SimCognitoHostedRedirect,
  SimCognitoLogoutInput,
} from "./hosted-auth.command.js";

/**
 * The `/logout` endpoint of a pool's hosted domain.
 *
 * Real Cognito ends the managed login session in the browser's cookie and
 * sends the user to one of the app client's sign-out URLs. Both happen here.
 * Ending the session is what makes the next authorize request ask for a
 * password again, and it is why an application's own sign-out has to come
 * through this endpoint. Clearing its own cookies and revoking the user's
 * tokens leaves this session where it was.
 *
 * It signs nobody out at the identity provider, which real Cognito also does
 * not do: a user signed out here is still signed in at Google.
 */
export class SimCognitoLogoutEndpoint {
  private readonly hostedClient = new SimCognitoHostedClient();

  /**
   * End the browser's managed login session, and send it to the application's
   * sign-out page.
   *
   * `presentedSession` is the session the browser carried, which the serving
   * layer reads out of the `cognito` cookie. A request arriving without one is
   * a sign-out by a browser that holds no session, and it redirects the same
   * way.
   */
  handle(
    pool: SimCognitoUserPool,
    input: SimCognitoLogoutInput,
    presentedSession?: string,
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

    pool.auth.endManagedLoginSession(presentedSession);

    return { location: logoutUri, session: SimCognitoSessionChange.ended() };
  }
}
