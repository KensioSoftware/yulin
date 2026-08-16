import {
  requireSimCognitoConfirmed,
  requireSimCognitoSignIn,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoSignInCompletion } from "./sim-cognito-sign-in-completion.js";
import type { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoNewPasswordChallenge } from "./sim-cognito-new-password-challenge.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoPasswordSignInProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly completion: SimCognitoSignInCompletion;
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
  private readonly completion: SimCognitoSignInCompletion;
  private readonly challenge: SimCognitoNewPasswordChallenge;
  private readonly triggers: SimCognitoUserPoolTriggers;

  constructor(properties: SimCognitoPasswordSignInProperties) {
    this.authResolver = properties.authResolver;
    this.completion = properties.completion;
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
   * it when it answers the challenge instead. `PreTokenGeneration` runs between
   * the two, where the token issuer settles the claims.
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

    // A user that has registered a second factor is challenged for it here
    // rather than answered with tokens, which is what the pool's
    // MfaConfiguration decides.
    //
    // `ClientMetadata` reaches PreAuthentication and PostAuthentication, and
    // not the token trigger: real Cognito does not pass an InitiateAuth or
    // AdminInitiateAuth request's on to that one.
    return await this.completion.challengeOrComplete({
      pool,
      client,
      user,
      occasion: SimCognitoTriggerOccasion.tokenGeneration,
      clientMetadata,
    });
  }
}
