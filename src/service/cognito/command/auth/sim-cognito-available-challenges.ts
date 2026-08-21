import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoFirstAuthFactor } from "../../user-pool/sim-cognito-sign-in-policy.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";

/**
 * The challenge a user answers with a password.
 */
export const simCognitoPasswordChallenge = "PASSWORD";

/**
 * The challenge a user answers by presenting a passkey.
 */
export const simCognitoWebAuthnChallenge = "WEB_AUTHN";

/**
 * The two first factors this simulation presents.
 *
 * A code sent by email or by text is a `USER_AUTH` challenge too, and neither
 * is issued here. Signing in by one-time code is its own flow, with its own
 * challenge, its own code and its own expiry, and none of it is built. A pool
 * sending its messages through SES changes nothing about that: what is missing
 * is the challenge rather than somewhere for the message to go.
 */
const presentedChallenges: readonly string[] = [
  simCognitoPasswordChallenge,
  simCognitoWebAuthnChallenge,
];

/**
 * Whether this user could present a factor the pool allows.
 *
 * A passkey has to have been registered, and a code has to have somewhere to
 * be sent. Real Cognito answers a user with the challenges it could actually
 * complete, and this is the same filter.
 */
function canPresent(
  factor: SimCognitoFirstAuthFactor,
  user: SimCognitoUser,
): boolean {
  if (factor === simCognitoWebAuthnChallenge) {
    return user.webAuthn.credentials.length > 0;
  }

  if (factor === "EMAIL_OTP") {
    return user.attributeValues.has("email");
  }

  if (factor === "SMS_OTP") {
    return user.attributeValues.has("phone_number");
  }

  return true;
}

/**
 * The challenges a `USER_AUTH` sign-in offers this user, in the order the
 * pool's sign-in policy named them.
 *
 * A pool created with no `SignInPolicy` allows a password and nothing else,
 * which is what real Cognito falls back to.
 */
export function simCognitoAvailableChallenges(
  pool: SimCognitoUserPool,
  user: SimCognitoUser,
): readonly string[] {
  return pool.settings.signInPolicy.factors.filter((factor) =>
    canPresent(factor, user),
  );
}

/**
 * Refuse a challenge this sign-in cannot offer, naming the ones it can.
 *
 * A factor the pool does not allow, one this user has nothing to answer with,
 * and one this simulation does not present all fail here, because each of them
 * ends the sign-in either way and the caller is owed the reason.
 */
export function requireSimCognitoAvailableChallenge(
  challengeName: string,
  available: readonly string[],
  field: string,
): void {
  if (!available.includes(challengeName)) {
    throw new SimCognitoInvalidParameterException(
      `${field} '${challengeName}' is not available to this user: the ` +
        `sign-in offers ${available.join(", ")}`,
    );
  }

  if (!presentedChallenges.includes(challengeName)) {
    throw new SimCognitoInvalidParameterException(
      `${field} '${challengeName}' is not simulated: signing in with a code ` +
        `sent by email or by text is a challenge flow this simulation does ` +
        `not run. Sign in with ${presentedChallenges.join(" or ")} instead.`,
    );
  }
}

/**
 * Refuse a password at a pool that allows none at the first prompt.
 *
 * A `USER_AUTH` request carrying a `PASSWORD` outright never reaches the
 * choice, so the policy is read here instead. A pool that allows no password
 * first refuses one, as it refuses one picked out of the choice.
 */
export function requireSimCognitoAllowedPassword(
  pool: SimCognitoUserPool,
): void {
  const { factors } = pool.settings.signInPolicy;

  if (!factors.includes(simCognitoPasswordChallenge)) {
    throw new SimCognitoInvalidParameterException(
      `AuthParameters PASSWORD is not a first factor this user pool allows: ` +
        `its SignInPolicy AllowedFirstAuthFactors names ${factors.join(", ")}`,
    );
  }
}
