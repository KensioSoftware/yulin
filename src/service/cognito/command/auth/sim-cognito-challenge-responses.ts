import {
  newPasswordRequiredChallenge,
  requireSimCognitoChallengeName,
} from "./sim-cognito-auth-challenge.js";
import {
  simCognitoPasswordChallenge,
  simCognitoWebAuthnChallenge,
} from "./sim-cognito-available-challenges.js";
import { simCognitoSelectChallenge } from "./sim-cognito-first-factor-challenge.js";
import type { SimCognitoFirstFactorResponse } from "./sim-cognito-first-factor-response.js";
import type { SimCognitoMfaResponse } from "./sim-cognito-mfa-response.js";
import type {
  SimCognitoChallengeResponseRequest,
  SimCognitoNewPasswordResponse,
} from "./sim-cognito-new-password-response.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoChallengeResponsesProperties {
  readonly newPassword: SimCognitoNewPasswordResponse;
  readonly mfa: SimCognitoMfaResponse;
  readonly firstFactor: SimCognitoFirstFactorResponse;
}

/**
 * The challenges a `USER_AUTH` sign-in issues, which one responder answers.
 */
const firstFactorChallenges: ReadonlySet<string> = new Set([
  simCognitoSelectChallenge,
  simCognitoPasswordChallenge,
  simCognitoWebAuthnChallenge,
]);

/**
 * Sends a challenge response to whichever challenge it is answering.
 *
 * `RespondToAuthChallenge` and `AdminRespondToAuthChallenge` both arrive here,
 * because the two differ in how they reach the pool and in nothing after that:
 * the same response completes the same challenge either way.
 */
export class SimCognitoChallengeResponses {
  private readonly newPassword: SimCognitoNewPasswordResponse;
  private readonly mfa: SimCognitoMfaResponse;
  private readonly firstFactor: SimCognitoFirstFactorResponse;

  constructor(properties: SimCognitoChallengeResponsesProperties) {
    this.newPassword = properties.newPassword;
    this.mfa = properties.mfa;
    this.firstFactor = properties.firstFactor;
  }

  /**
   * Answer the challenge the request names, or refuse a challenge this
   * simulation does not issue.
   */
  async handle(
    challengeName: string | undefined,
    request: SimCognitoChallengeResponseRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    const challenge = requireSimCognitoChallengeName(challengeName);

    if (challenge === newPasswordRequiredChallenge) {
      return await this.newPassword.handle(request);
    }

    if (firstFactorChallenges.has(challenge)) {
      return await this.firstFactor.handle({
        ...request,
        challengeName: challenge,
      });
    }

    return await this.mfa.handle({ ...request, challengeName: challenge });
  }
}
