import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  requireSimCognitoEnabled,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import { SimCognitoMfaCodeCheck } from "./sim-cognito-mfa-code-check.js";
import type { SimCognitoChallengeResponseRequest } from "./sim-cognito-new-password-response.js";
import type { SimCognitoSignInCompletion } from "./sim-cognito-sign-in-completion.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoMfaResponseProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly completion: SimCognitoSignInCompletion;
  readonly clock: SimClock;
}

/**
 * A response to one of the two MFA challenges.
 */
export interface SimCognitoMfaResponseRequest extends SimCognitoChallengeResponseRequest {
  /** Which challenge is being answered, which its session has to match. */
  readonly challengeName: string;
}

/**
 * Answering an `SMS_MFA` or `SOFTWARE_TOKEN_MFA` challenge.
 *
 * The code is checked against whatever issued it: a texted code against the
 * one the challenge sent, which the session holds, and an authenticator app's
 * code against the secret the user registered. A wrong code leaves the session
 * alone, so the caller can read the next code off its app or ask the user to
 * retype the one it was sent, as real Cognito lets it. A right one spends the
 * session, so the same code cannot sign in twice.
 *
 * This is the body of both `AdminRespondToAuthChallenge` and
 * `RespondToAuthChallenge`, which differ only in how they reach the pool.
 */
export class SimCognitoMfaResponse {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly completion: SimCognitoSignInCompletion;
  private readonly clock: SimClock;
  private readonly codeCheck: SimCognitoMfaCodeCheck;

  constructor(properties: SimCognitoMfaResponseProperties) {
    this.authResolver = properties.authResolver;
    this.completion = properties.completion;
    this.clock = properties.clock;
    this.codeCheck = new SimCognitoMfaCodeCheck(properties.clock);
  }

  /**
   * Complete the challenge, and sign the user in.
   *
   * This is where the sign-in the challenge interrupted finishes, so it is
   * where `PostAuthentication` runs and where the tokens are issued.
   * `PreAuthentication` does not run again: it ran when the password was
   * checked, and real Cognito fires it once per sign-in rather than once per
   * request.
   */
  async handle(
    request: SimCognitoMfaResponseRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { pool, client, parameters, challengeName } = request;
    const username = this.authResolver.username(client, parameters);
    const session = pool.auth.requireSession({
      sessionId: request.session,
      username,
      clientId: client.id,
      challengeName,
      now: this.clock.now(),
    });
    const user = requireSimCognitoSignInUser(pool, client, username);

    // A user disabled between the challenge and this response cannot finish
    // the sign-in, as it cannot start one.
    requireSimCognitoEnabled(user);

    this.codeCheck.require({ user, session, parameters });
    pool.auth.removeSession(session);

    return await this.completion.complete({
      pool,
      client,
      user,
      occasion: SimCognitoTriggerOccasion.tokenGeneration,
      tokenClientMetadata: request.clientMetadata,
      clientMetadata: request.clientMetadata,
    });
  }
}
