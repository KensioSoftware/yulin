/**
 * What made a simulated user pool send a message.
 *
 * These are the three occasions this simulation reaches: a user signing itself
 * up, that user asking for another code, and an administrator creating a user.
 * Real Cognito sends on more of them, password reset and MFA among them, and
 * neither of those is simulated here.
 *
 * `SimCognitoTriggerOccasion.customMessage` turns one of these into the
 * occasion the `CustomMessage` trigger fires for.
 */
export type SimCognitoMessageOccasion =
  "SignUp" | "ResendCode" | "AdminCreateUser";
