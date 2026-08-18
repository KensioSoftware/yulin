import {
  SimCognitoCodeMismatchException,
  SimCognitoInvalidParameterException,
  SimCognitoUserNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import { SimCognitoMessageDelivery } from "../../user-pool/message/sim-cognito-message-delivery.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";

/**
 * Find the user a `ForgotPassword` names, or answer with nothing where the app
 * client hides that it is missing.
 *
 * A client on the `LEGACY` default says the user does not exist. One with
 * `PreventUserExistenceErrors` of `ENABLED` leaves the caller to answer as
 * though a code had gone out, which is what stops the operation being used to
 * find out who has an account.
 */
export function findSimCognitoResettingUser(
  pool: SimCognitoUserPool,
  client: SimCognitoUserPoolClient,
  username: string,
): SimCognitoUser | undefined {
  const user = pool.findUser(username);

  if (user !== undefined) {
    return user;
  }

  if (client.preventUserExistenceErrors.hidesUserExistence) {
    return undefined;
  }

  throw new SimCognitoUserNotFoundException("User does not exist.");
}

/**
 * Resolve the user a `ConfirmForgotPassword` names, as the app client reports
 * one that is not there.
 *
 * A client hiding user existence answers with the same code mismatch a wrong
 * code gets. Saying the user is missing would be the leak the setting exists
 * to close.
 */
export function requireSimCognitoResettingUser(
  pool: SimCognitoUserPool,
  client: SimCognitoUserPoolClient,
  username: string,
): SimCognitoUser {
  const user = findSimCognitoResettingUser(pool, client, username);

  if (user === undefined) {
    throw new SimCognitoCodeMismatchException(
      "Invalid verification code provided, please try again.",
    );
  }

  return user;
}

/**
 * Where a reset code would go, or a refusal where the pool has nowhere to send
 * one.
 *
 * The code goes to an attribute the pool verifies automatically, which is the
 * address a sign-up code goes to. Real Cognito chooses by the pool's
 * `AccountRecoverySetting` and refuses a user it can reach at neither address
 * in these words.
 */
export function requireSimCognitoResetDelivery(
  pool: SimCognitoUserPool,
  user: SimCognitoUser,
): SimCognitoMessageDelivery {
  const delivery = SimCognitoMessageDelivery.forOccasion(
    pool,
    user,
    "ForgotPassword",
  );

  if (delivery === undefined) {
    throw new SimCognitoInvalidParameterException(
      `Cannot reset password for the user as there is no ` +
        `registered/verified email or phone_number`,
    );
  }

  return delivery;
}
