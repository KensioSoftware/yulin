import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import {
  simCognitoSmsMfa,
  simCognitoSoftwareTokenMfa,
} from "../../user-pool/user/mfa/sim-cognito-mfa-factors.js";

/**
 * The challenge a user with a temporary password is answered with.
 */
export const newPasswordRequiredChallenge = "NEW_PASSWORD_REQUIRED";

/**
 * The challenges this simulation issues and can be answered with.
 *
 * The two MFA challenges are named after the factors they are for, which is
 * how Cognito names them: a user registered for a software token is
 * challenged with `SOFTWARE_TOKEN_MFA` and answers with a
 * `SOFTWARE_TOKEN_MFA_CODE`.
 */
const answerableChallenges: readonly string[] = [
  newPasswordRequiredChallenge,
  simCognitoSmsMfa,
  simCognitoSoftwareTokenMfa,
];

/**
 * Refuse a challenge this simulation cannot answer.
 *
 * `MFA_SETUP` and the custom authentication challenges are refused rather than
 * answered as one of these, because what a caller has to send back is
 * different for each.
 */
export function requireSimCognitoChallengeName(
  challengeName: string | undefined,
): string {
  if (
    challengeName !== undefined &&
    answerableChallenges.includes(challengeName)
  ) {
    return challengeName;
  }

  throw new SimCognitoInvalidParameterException(
    `ChallengeName '${String(challengeName)}' is not simulated: ` +
      `${answerableChallenges.join(", ")} are the challenges this ` +
      `simulation issues.`,
  );
}
