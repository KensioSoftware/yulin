import {
  SimCognitoNotAuthorizedException,
  SimCognitoPasswordResetRequiredException,
  SimCognitoUserNotConfirmedException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import { requireSimCognitoUsername } from "../user/sim-cognito-username.js";

/**
 * Resolve the user a sign-in names, as the app client reports one that is not
 * there.
 *
 * A client with `PreventUserExistenceErrors` of `ENABLED` answers with the
 * same refusal a wrong password gets, and one left on the `LEGACY` default
 * says the user does not exist.
 */
export function requireSimCognitoSignInUser(
  pool: SimCognitoUserPool,
  client: SimCognitoUserPoolClient,
  username: string,
): SimCognitoUser {
  const named = requireSimCognitoUsername(username);

  if (!client.preventUserExistenceErrors.hidesUserExistence) {
    return pool.requireUser(named);
  }

  const user = pool.findUser(named);

  if (user === undefined) {
    throw new SimCognitoNotAuthorizedException(
      "Incorrect username or password.",
    );
  }

  return user;
}

/**
 * Refuse a user that has been disabled.
 *
 * Disabling a user stops it authenticating at all, so it is checked by a token
 * refresh as well as by a sign-in: a user disabled after signing in cannot go
 * on renewing its session.
 */
export function requireSimCognitoEnabled(user: SimCognitoUser): void {
  if (!user.enabled) {
    throw new SimCognitoNotAuthorizedException("User is disabled.");
  }
}

/**
 * Refuse a sign-in by a user that has not confirmed its sign-up.
 *
 * This is checked after the password, because that is the order real Cognito
 * answers in: an unconfirmed user with the wrong password is refused as any
 * other wrong password is, and one with the right password is told what is
 * actually missing, so an application can send it to `ConfirmSignUp`.
 */
export function requireSimCognitoConfirmed(user: SimCognitoUser): void {
  if (user.status.isUnconfirmed) {
    throw new SimCognitoUserNotConfirmedException("User is not confirmed.");
  }
}

/**
 * Refuse a sign-in by a user whose password an administrator has reset.
 *
 * This is checked alongside the confirmation, and for the same reason: the
 * user is told what is actually missing, so an application can send it to
 * `ConfirmForgotPassword` with the code the reset issued rather than back to
 * the password field.
 */
export function requireSimCognitoPasswordSet(user: SimCognitoUser): void {
  if (user.status.mustResetPassword) {
    throw new SimCognitoPasswordResetRequiredException(
      "Password reset required for the user.",
    );
  }
}

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
  requireSimCognitoEnabled(user);

  if (!user.hasPassword(password)) {
    throw new SimCognitoNotAuthorizedException(
      "Incorrect username or password.",
    );
  }
}
