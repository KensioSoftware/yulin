import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoAuthorizationCode } from "../../user-pool/auth/sim-cognito-authorization-code.js";
import type { SimCognitoFederatedSignIn } from "../../user-pool/idp/sim-cognito-federated-sign-in.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCognitoAuthorizeRequest } from "./sim-cognito-authorize-request.js";
import { SimCognitoGrantedScopes } from "./sim-cognito-granted-scopes.js";
import { SimCognitoHostedClient } from "./sim-cognito-hosted-client.js";
import type {
  SimCognitoAuthorizeInput,
  SimCognitoHostedRedirect,
} from "./hosted-auth.command.js";

interface SimCognitoAuthorizeEndpointProperties {
  readonly federatedSignIn: SimCognitoFederatedSignIn;
  readonly clock: SimClock;
}

/**
 * The `/oauth2/authorize` endpoint of a pool's hosted domain.
 *
 * Real Cognito answers this request in one of two ways: it sends the browser
 * to an identity provider's sign-in page when the request names a provider,
 * and to managed login's own page when it does not. Only the first has an
 * equivalent here, because the second is a web page a person fills in, and a
 * simulation of a person filling it in would be a simulation of nothing.
 *
 * So a request naming a provider signs in the user that provider has been told
 * is signed in at it, and answers with the code real Cognito would answer
 * with. A request naming no provider, or naming the pool's own users, is
 * refused with a message saying so, rather than being answered with a page or
 * with a user nothing put there.
 */
export class SimCognitoAuthorizeEndpoint {
  private readonly federatedSignIn: SimCognitoFederatedSignIn;
  private readonly clock: SimClock;
  private readonly hostedClient = new SimCognitoHostedClient();
  private readonly request = new SimCognitoAuthorizeRequest();

  constructor(properties: SimCognitoAuthorizeEndpointProperties) {
    this.federatedSignIn = properties.federatedSignIn;
    this.clock = properties.clock;
  }

  /**
   * Sign a user in through an identity provider, and send the browser back to
   * the application with an authorization code.
   */
  handle(
    pool: SimCognitoUserPool,
    input: SimCognitoAuthorizeInput,
  ): SimCognitoHostedRedirect {
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
    const provider = this.request.requiredProvider(pool, client, input);
    const user = this.federatedSignIn.signIn({
      pool,
      provider,
      now: this.clock.now(),
    });

    const code = new SimCognitoAuthorizationCode({
      username: user.username,
      clientId: client.id,
      redirectUri,
      scopes: scopes.values,
      issuedAt: this.clock.now(),
      codeChallenge: input.code_challenge,
    });

    pool.auth.addAuthorizationCode(code);

    return {
      location: this.redirectWithCode(redirectUri, code.value, input.state),
      username: user.username,
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
