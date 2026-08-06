import {
  requireSimCognitoConfirmed,
  requireSimCognitoSignIn,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import type { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoNewPasswordChallenge } from "./sim-cognito-new-password-challenge.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoPasswordSignInProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly challenge: SimCognitoNewPasswordChallenge;
  readonly triggers: SimCognitoUserPoolTriggers;
}

/**
 * What a sign-in request has resolved before the flow runs.
 */
export interface SimCognitoAuthRequest {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly parameters: SimCognitoAuthParameters;

  /**
   * The `ClientMetadata` the request carried, which is what a Lambda trigger
   * reads as its validation data or its client metadata.
   */
  readonly clientMetadata?: Readonly<Record<string, string>> | undefined;
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
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly result = new SimCognitoAuthenticationResult();

  constructor(properties: SimCognitoPasswordSignInProperties) {
    this.authResolver = properties.authResolver;
    this.tokenIssuer = properties.tokenIssuer;
    this.challenge = properties.challenge;
    this.triggers = properties.triggers;
  }

  /**
   * Sign the user in, or answer with the challenge it has to get past first.
   *
   * The pool's `PreAuthentication` trigger runs once the user is known and
   * before its password is checked, which is the order real Cognito runs it in:
   * the trigger is given the user to decide about, and deciding is what it is
   * for, so a wrong password reaches it too.
   *
   * `PostAuthentication` runs only where tokens were issued. A user answered
   * with the `NEW_PASSWORD_REQUIRED` challenge has not signed in yet, and runs
   * it when it answers the challenge instead.
   */
  async handle(
    request: SimCognitoAuthRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { pool, client, parameters, clientMetadata } = request;
    const username = this.authResolver.username(client, parameters);
    const user = requireSimCognitoSignInUser(pool, client, username);

    await this.triggers.preAuthentication({
      pool,
      client,
      user,
      clientMetadata,
    });

    requireSimCognitoSignIn(user, parameters.require("PASSWORD"));
    requireSimCognitoConfirmed(user);

    if (user.status.mustChangePassword) {
      return this.challenge.issue({ pool, clientId: client.id, user });
    }

    const authenticated = {
      $metadata: {},
      AuthenticationResult: this.result.of(
        this.tokenIssuer.issue({ pool, client, user }),
      ),
    };

    await this.triggers.postAuthentication({
      pool,
      client,
      user,
      clientMetadata,
    });

    return authenticated;
  }
}
