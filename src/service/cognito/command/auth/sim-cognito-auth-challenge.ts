import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The challenge this simulation can answer.
 */
export const newPasswordRequiredChallenge = "NEW_PASSWORD_REQUIRED";

/**
 * Refuse a challenge this simulation cannot answer.
 *
 * MFA and custom authentication challenges are refused rather than answered as
 * this one, because what a caller has to send back is different for each.
 */
export function requireSimCognitoNewPasswordChallenge(
  challengeName: string | undefined,
): void {
  if (challengeName === newPasswordRequiredChallenge) {
    return;
  }

  throw new SimCognitoInvalidParameterException(
    `ChallengeName '${String(challengeName)}' is not simulated: ` +
      `${newPasswordRequiredChallenge} is the only challenge this ` +
      `simulation issues.`,
  );
}
