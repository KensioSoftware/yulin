import {
  requireSimCognitoSignIn,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import type { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoNewPasswordChallenge } from "./sim-cognito-new-password-challenge.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoPasswordSignInProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly challenge: SimCognitoNewPasswordChallenge;
}

/**
 * What a sign-in request has resolved before the flow runs.
 */
export interface SimCognitoAuthRequest {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly parameters: SimCognitoAuthParameters;
}

/**
 * Signing a user in with a username and password.
 *
 * This is the body of both `ADMIN_USER_PASSWORD_AUTH` and
 * `USER_PASSWORD_AUTH`. The two differ in what the caller has to be allowed to
 * do and which `ExplicitAuthFlows` entry opens them, both of which are settled
 * before this runs, and in nothing after that: real Cognito signs the same
 * user in with the same password and answers with the same tokens.
 */
export class SimCognitoPasswordSignIn {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly tokenIssuer: SimCognitoTokenIssuer;
  private readonly challenge: SimCognitoNewPasswordChallenge;
  private readonly result = new SimCognitoAuthenticationResult();

  constructor(properties: SimCognitoPasswordSignInProperties) {
    this.authResolver = properties.authResolver;
    this.tokenIssuer = properties.tokenIssuer;
    this.challenge = properties.challenge;
  }

  /**
   * Sign the user in, or answer with the challenge it has to get past first.
   */
  handle(request: SimCognitoAuthRequest): SimCognitoAuthenticationOutput {
    const { pool, client, parameters } = request;
    const username = this.authResolver.username(client, parameters);
    const user = requireSimCognitoSignInUser(pool, client, username);

    requireSimCognitoSignIn(user, parameters.require("PASSWORD"));

    if (user.status.mustChangePassword) {
      return this.challenge.issue({ pool, clientId: client.id, user });
    }

    return {
      $metadata: {},
      AuthenticationResult: this.result.of(
        this.tokenIssuer.issue({ pool, client, user }),
      ),
    };
  }
}
