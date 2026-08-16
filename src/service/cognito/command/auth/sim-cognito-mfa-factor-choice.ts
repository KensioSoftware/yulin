import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";

/**
 * Which factor a sign-in is challenged for, and nothing where the sign-in
 * carries on without a challenge.
 *
 * A pool configured `OFF` challenges nobody, whatever its users have
 * registered. One configured `OPTIONAL` challenges the users that registered a
 * factor, and one configured `ON` challenges every user.
 */
export function simCognitoChallengeFactor(
  pool: SimCognitoUserPool,
  user: SimCognitoUser,
): string | undefined {
  if (!pool.settings.mfa.configuration.challengesAnySignIn) {
    return undefined;
  }

  const factor = user.mfa.challengeFactor;

  if (factor !== undefined) {
    return factor;
  }

  refuseUnchallengeable(pool, user);

  return undefined;
}

/**
 * Refuse a sign-in real Cognito would answer with a challenge this simulation
 * does not issue.
 *
 * A user with two factors enabled and no preference between them is answered
 * with `SELECT_MFA_TYPE`, and a user of an `ON` pool with no factor at all
 * with `MFA_SETUP`. Both choose or register something mid-sign-in, which is a
 * flow of its own, so the sign-in is refused here rather than handed tokens a
 * deployment would not have handed out.
 */
function refuseUnchallengeable(
  pool: SimCognitoUserPool,
  user: SimCognitoUser,
): void {
  if (user.mfa.settings.length > 1) {
    throw new SimCognitoInvalidParameterException(
      `User ${user.username} has ${user.mfa.settings.join(" and ")} enabled ` +
        `and prefers neither, so real Cognito would answer this sign-in with ` +
        `a SELECT_MFA_TYPE challenge, which is not simulated. Prefer one of ` +
        `them with SetUserMFAPreference.`,
    );
  }

  if (pool.settings.mfa.configuration.challengesEverySignIn) {
    throw new SimCognitoInvalidParameterException(
      `User pool ${pool.id} has an MfaConfiguration of 'ON' and user ` +
        `${user.username} has registered no second factor, so real Cognito ` +
        `would answer this sign-in with an MFA_SETUP challenge, which is not ` +
        `simulated. Register a factor for the user, or set the pool's ` +
        `MfaConfiguration to 'OPTIONAL' or 'OFF'.`,
    );
  }
}
