import {
  requireSimCognitoConfirmed,
  requireSimCognitoPasswordSet,
  requireSimCognitoSignIn,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoAuthSession } from "../../user-pool/auth/sim-cognito-auth-session.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoFirstFactorResponseRequest } from "./sim-cognito-first-factor-response.js";
import type { SimCognitoSignInCompletion } from "./sim-cognito-sign-in-completion.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoPasswordResponseProperties {
  readonly completion: SimCognitoSignInCompletion;
}

/**
 * Signing in with the password a `USER_AUTH` challenge asked for.
 *
 * This is the same password check `USER_PASSWORD_AUTH` makes, reached the
 * other way. A `PASSWORD` challenge is answered with it, and so is a
 * `SELECT_CHALLENGE` whose `ANSWER` picked `PASSWORD`, which is the shape the
 * Cognito documentation gives for choosing a password.
 *
 * A user that has registered a second factor is challenged for it afterwards,
 * as it is on every other password sign-in. A wrong password leaves the
 * challenge session standing, so the person can type it again.
 */
export class SimCognitoPasswordResponse {
  private readonly completion: SimCognitoSignInCompletion;

  constructor(properties: SimCognitoPasswordResponseProperties) {
    this.completion = properties.completion;
  }

  /**
   * Check the password and finish, or answer with the second factor the user
   * still owes.
   */
  async complete(
    request: SimCognitoFirstFactorResponseRequest,
    session: SimCognitoAuthSession,
    user: SimCognitoUser,
  ): Promise<SimCognitoAuthenticationOutput> {
    requireSimCognitoSignIn(user, request.parameters.require("PASSWORD"));
    requireSimCognitoConfirmed(user);
    requireSimCognitoPasswordSet(user);

    request.pool.auth.removeSession(session);

    return await this.completion.challengeOrComplete({
      pool: request.pool,
      client: request.client,
      user,
      occasion: SimCognitoTriggerOccasion.tokenGeneration,
      tokenClientMetadata: request.clientMetadata,
      clientMetadata: request.clientMetadata,
    });
  }
}
