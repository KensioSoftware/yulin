import {
  newPasswordRequiredChallenge,
  requireSimCognitoChallengeName,
} from "./sim-cognito-auth-challenge.js";
import type { SimCognitoMfaResponse } from "./sim-cognito-mfa-response.js";
import type {
  SimCognitoChallengeResponseRequest,
  SimCognitoNewPasswordResponse,
} from "./sim-cognito-new-password-response.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoChallengeResponsesProperties {
  readonly newPassword: SimCognitoNewPasswordResponse;
  readonly mfa: SimCognitoMfaResponse;
}

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

  constructor(properties: SimCognitoChallengeResponsesProperties) {
    this.newPassword = properties.newPassword;
    this.mfa = properties.mfa;
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

    return await this.mfa.handle({ ...request, challengeName: challenge });
  }
}
