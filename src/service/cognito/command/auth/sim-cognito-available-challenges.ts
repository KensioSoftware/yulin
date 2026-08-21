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
 * is issued here. Nothing delivers a message, and the pool's own
 * `EmailConfiguration` and `SmsConfiguration` are refused for the same reason.
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
): string {
  if (!available.includes(challengeName)) {
    throw new SimCognitoInvalidParameterException(
      `${field} '${challengeName}' is not available to this user: the ` +
        `sign-in offers ${available.join(", ")}`,
    );
  }

  if (!presentedChallenges.includes(challengeName)) {
    throw new SimCognitoInvalidParameterException(
      `${field} '${challengeName}' is not simulated: a code sent by email or ` +
        `by text needs the pool's EmailConfiguration or SmsConfiguration, ` +
        `and this simulation delivers no message. Sign in with ` +
        `${presentedChallenges.join(" or ")} instead.`,
    );
  }

  return challengeName;
}
