import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoMessageOccasion } from "./sim-cognito-message-occasion.js";
import { SimCognitoMessageWording } from "./sim-cognito-message-wording.js";
import type { SimCognitoMessageMedium } from "./sim-cognito-sent-message.js";

/**
 * The wording real Cognito invites an admin-created user with when the pool
 * asked for none.
 *
 * These are the defaults the Cognito API documentation states for
 * `AdminCreateUserConfig InviteMessageTemplate`, rather than values read back
 * from a live account. `InviteMessageTemplate` itself is refused, so a pool
 * cannot ask for anything else here yet.
 */
const invitationSubject = "Your temporary password";
const invitationMessage =
  "Your username is {username} and temporary password is {####}.";

/**
 * The wording real Cognito sends an MFA code with when the pool asked for
 * none.
 *
 * `SmsAuthenticationMessage` is what a pool sets its own with, and that input
 * is refused here, so this is the wording every MFA code goes out under.
 */
const authenticationMessage = "Your authentication code is {####}.";

/**
 * What a pool says on the occasion it is sending on.
 *
 * The invitation an administrator's user is sent is the pool's own wording as
 * much as the verification message is, and only the verification wording can
 * be set on a pool here.
 */
export function simCognitoOccasionWording(
  pool: SimCognitoUserPool,
  occasion: SimCognitoMessageOccasion,
  medium: SimCognitoMessageMedium,
): SimCognitoMessageWording {
  if (occasion === "Authentication") {
    return new SimCognitoMessageWording({ body: authenticationMessage });
  }

  if (occasion !== "AdminCreateUser") {
    return pool.settings.verificationMessages.wording(medium);
  }

  if (medium === "SMS") {
    return new SimCognitoMessageWording({ body: invitationMessage });
  }

  return new SimCognitoMessageWording({
    subject: invitationSubject,
    body: invitationMessage,
  });
}
