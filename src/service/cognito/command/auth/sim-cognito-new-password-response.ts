import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  requireSimCognitoEnabled,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import { SimCognitoPasswordCheck } from "../../user-pool/sim-cognito-password-check.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import { newPasswordRequiredChallenge } from "./sim-cognito-auth-challenge.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoSignInCompletion } from "./sim-cognito-sign-in-completion.js";
import type { SimCognitoAuthRequest } from "./sim-cognito-password-sign-in.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoNewPasswordResponseProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly completion: SimCognitoSignInCompletion;
  readonly clock: SimClock;
}

/**
 * A challenge response, and the session tying it to the request that issued
 * the challenge.
 */
export interface SimCognitoChallengeResponseRequest extends SimCognitoAuthRequest {
  readonly session: string | undefined;
}

/**
 * Answering the `NEW_PASSWORD_REQUIRED` challenge.
 *
 * The new password is checked against the pool's policy, confirms the user,
 * and is what the user signs in with from then on. The session is single use,
 * so a replayed one fails. This is the body of both
 * `AdminRespondToAuthChallenge` and `RespondToAuthChallenge`, which differ only
 * in how they reach the pool.
 */
export class SimCognitoNewPasswordResponse {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly completion: SimCognitoSignInCompletion;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoNewPasswordResponseProperties) {
    this.authResolver = properties.authResolver;
    this.completion = properties.completion;
    this.clock = properties.clock;
  }

  /**
   * Complete the challenge, and sign the user in.
   *
   * This is where the sign-in the challenge interrupted finishes, so it is
   * where the pool's `PostAuthentication` trigger runs, and where its
   * `PreTokenGeneration` trigger runs with a `triggerSource` of
   * `TokenGeneration_NewPasswordChallenge`. `PreAuthentication` does not run
   * again: it ran when the challenge was issued, and real Cognito fires it once
   * per sign-in rather than once per request.
   */
  async handle(
    request: SimCognitoChallengeResponseRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { pool, client, parameters } = request;
    const username = this.authResolver.username(client, parameters);
    const session = pool.auth.requireSession({
      sessionId: request.session,
      username,
      clientId: client.id,
      challengeName: newPasswordRequiredChallenge,
      now: this.clock.now(),
    });
    const user = requireSimCognitoSignInUser(pool, client, username);

    // A user disabled between the challenge and this response cannot finish
    // the sign-in, as it cannot start one.
    requireSimCognitoEnabled(user);

    user.setPassword(
      new SimCognitoPasswordCheck(pool.settings.passwordPolicy).require(
        "NEW_PASSWORD",
        parameters.find("NEW_PASSWORD"),
      ),
      true,
    );

    pool.auth.removeSession(session);

    // A user that has registered a second factor answers for it before the
    // sign-in this challenge interrupted can finish, as it would on real
    // Cognito: one challenge follows the other.
    //
    // This is the one occasion real Cognito passes a request's `ClientMetadata`
    // to the token trigger, so it travels with the tokens here and nowhere
    // else.
    return await this.completion.challengeOrComplete({
      pool,
      client,
      user,
      occasion: SimCognitoTriggerOccasion.newPasswordTokenGeneration,
      tokenClientMetadata: request.clientMetadata,
      clientMetadata: request.clientMetadata,
    });
  }
}
