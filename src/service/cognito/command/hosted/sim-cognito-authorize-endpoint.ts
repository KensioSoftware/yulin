import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoAuthorizationCode } from "../../user-pool/auth/sim-cognito-authorization-code.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCognitoAuthorizeRequest } from "./sim-cognito-authorize-request.js";
import { SimCognitoGrantedScopes } from "./sim-cognito-granted-scopes.js";
import { SimCognitoHostedClient } from "./sim-cognito-hosted-client.js";
import type { SimCognitoHostedSignIn } from "./sim-cognito-hosted-sign-in.js";
import type {
  SimCognitoAuthorizeInput,
  SimCognitoHostedRedirect,
} from "./hosted-auth.command.js";

interface SimCognitoAuthorizeEndpointProperties {
  readonly signIn: SimCognitoHostedSignIn;
  readonly clock: SimClock;
}

/**
 * The `/oauth2/authorize` endpoint of a pool's hosted domain.
 *
 * Real Cognito answers this request in one of two ways: it sends the browser
 * to an identity provider's sign-in page when the request names a provider,
 * and to managed login's own form when it does not. Both end in the same
 * place, which is the app client's callback URL carrying an authorization
 * code, and both end there here.
 *
 * A request naming a provider signs in the user that provider has been told is
 * signed in at it. A request naming none signs in one of the pool's own users,
 * with the username and password real managed login would have taken from its
 * form, with a passkey presented against a challenge the pool issued, or from
 * the managed login session the browser presented. Nothing here draws the
 * form: the serving layer is what answers a browser with a page, and a test
 * calling this directly passes the fields the form would have posted.
 */
export class SimCognitoAuthorizeEndpoint {
  private readonly signIn: SimCognitoHostedSignIn;
  private readonly clock: SimClock;
  private readonly hostedClient = new SimCognitoHostedClient();
  private readonly request = new SimCognitoAuthorizeRequest();

  constructor(properties: SimCognitoAuthorizeEndpointProperties) {
    this.signIn = properties.signIn;
    this.clock = properties.clock;
  }

  /**
   * Sign a user in, and send the browser back to the application with an
   * authorization code.
   *
   * `presentedSession` is the managed login session the browser carried, which
   * the serving layer reads out of the `cognito` cookie.
   */
  async handle(
    pool: SimCognitoUserPool,
    input: SimCognitoAuthorizeInput,
    presentedSession?: string,
  ): Promise<SimCognitoHostedRedirect> {
    const client = this.hostedClient.forAuthorize(pool, input.client_id);
    const redirectUri = this.hostedClient.requiredRedirectUri(
      client,
      input.redirect_uri,
    );

    // Everything from here on is refused by sending the browser back to the
    // application, because the request has shown it knows a redirect URI this
    // app client registered.
    this.request.requireResponseType(input.response_type);
    this.hostedClient.requireCodeGrant(client, true);
    this.request.requireChallengeMethod(input);

    const scopes = new SimCognitoGrantedScopes(client, input.scope);
    const signedIn = await this.signIn.signIn(
      pool,
      client,
      input,
      presentedSession,
    );
    const { user } = signedIn;

    const code = new SimCognitoAuthorizationCode({
      username: user.username,
      clientId: client.id,
      redirectUri,
      scopes: scopes.values,
      issuedAt: this.clock.now(),
      codeChallenge: input.code_challenge,
      federated: signedIn.federated,
    });

    pool.auth.addAuthorizationCode(code);

    return {
      location: this.redirectWithCode(redirectUri, code.value, input.state),
      username: user.username,
      session: signedIn.session,
    };
  }

  private redirectWithCode(
    redirectUri: string,
    code: string,
    state: string | undefined,
  ): string {
    const location = new URL(redirectUri);

    location.searchParams.set("code", code);

    if (state !== undefined) {
      location.searchParams.set("state", state);
    }

    return location.href;
  }
}
