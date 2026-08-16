/**
 * What made a simulated user pool send a message.
 *
 * These are the four occasions this simulation reaches: a user signing itself
 * up, that user asking for another code, an administrator creating a user, and
 * a sign-in being challenged for a code sent by text message. Real Cognito
 * sends on more of them, a password reset among them, which is not simulated
 * here.
 *
 * `SimCognitoTriggerOccasion.customMessage` turns one of these into the
 * occasion the `CustomMessage` trigger fires for.
 */
export type SimCognitoMessageOccasion =
  | "SignUp"
  | "ResendCode"
  | "AdminCreateUser"
  | "Authentication";
