import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";

/**
 * Refuse a sign-in the user cannot make.
 *
 * A disabled user and a wrong password both fail as `NotAuthorizedException`,
 * saying no more than real Cognito says. A user created without a
 * `TemporaryPassword` has no password at all, so nothing matches: real Cognito
 * generates one and sends it to the user, and nothing here delivers a message
 * for the user to read it from.
 */
export function requireSimCognitoSignIn(
  user: SimCognitoUser,
  password: string,
): void {
  if (!user.enabled) {
    throw new SimCognitoNotAuthorizedException("User is disabled.");
  }

  if (!user.hasPassword(password)) {
    throw new SimCognitoNotAuthorizedException(
      "Incorrect username or password.",
    );
  }
}
