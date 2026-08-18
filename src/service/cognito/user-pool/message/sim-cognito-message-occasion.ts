/**
 * What made a simulated user pool send a message.
 *
 * These are the five occasions this simulation reaches: a user signing itself
 * up, that user asking for another code, an administrator creating a user, a
 * sign-in being challenged for a code sent by text message, and a password
 * being reset. Real Cognito sends on more of them, an attribute being verified
 * among them, which is not simulated here.
 *
 * `ForgotPassword` covers the reset an administrator starts as well as the one
 * the user asks for, because real Cognito sends both under the one
 * `CustomMessage_ForgotPassword` trigger source.
 *
 * `SimCognitoTriggerOccasion.customMessage` turns one of these into the
 * occasion the `CustomMessage` trigger fires for.
 */
export type SimCognitoMessageOccasion =
  | "SignUp"
  | "ResendCode"
  | "AdminCreateUser"
  | "Authentication"
  | "ForgotPassword";
