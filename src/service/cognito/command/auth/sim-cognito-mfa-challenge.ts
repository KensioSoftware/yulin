import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";

/**
 * The multi-factor challenge a pool would answer a sign-in with, which this
 * simulation cannot issue.
 *
 * A pool configured `ON` challenges every user on real Cognito, whether or not
 * that user has registered a factor: one that has is sent
 * `SOFTWARE_TOKEN_MFA` or `SMS_MFA`, and one that has not is sent `MFA_SETUP`.
 * Either way the request that carried the password is answered with a
 * challenge rather than with tokens, so signing the user in here would hand
 * out tokens a real deployment would not.
 *
 * A pool configured `OPTIONAL` challenges only the users that registered a
 * factor. Nothing here registers one, so no user of such a pool has one, and
 * signing in without a challenge is what real Cognito does with it too.
 *
 * This is the refusal `CreateUserPool` used to make. It is here instead
 * because this is where the difference shows: a pool that records the setting
 * and never challenges on it is honest for everything but a sign-in.
 */
export class SimCognitoMfaChallenge {
  /**
   * Refuse a sign-in that real Cognito would answer with an MFA challenge.
   */
  refuseIn(pool: SimCognitoUserPool): void {
    if (!pool.settings.mfa.configuration.challengesEverySignIn) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `User pool ${pool.id} has an MfaConfiguration of 'ON', so real ` +
        `Cognito would answer this sign-in with an MFA challenge, and ` +
        `multi-factor authentication is not simulated. Set the pool's ` +
        `MfaConfiguration to 'OPTIONAL' or 'OFF' to sign in with a password ` +
        `alone.`,
    );
  }
}
