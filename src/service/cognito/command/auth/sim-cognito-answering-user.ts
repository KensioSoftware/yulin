import type { SimCognitoAuthSession } from "../../user-pool/auth/sim-cognito-auth-session.js";
import {
  requireSimCognitoEnabled,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoFirstFactorResponseRequest } from "./sim-cognito-first-factor-response.js";

/**
 * A challenge response that has been tied back to the sign-in it answers.
 */
export interface SimCognitoAnsweringUser {
  readonly session: SimCognitoAuthSession;
  readonly user: SimCognitoUser;
}

/**
 * The session a challenge response carries and the user it belongs to.
 *
 * A session that has run out, one already spent, one for another user or app
 * client and one issued for another challenge are all refused the same way,
 * which is what real Cognito does with each. A user disabled between the
 * challenge and the response cannot finish the sign-in either, as it could not
 * start one.
 */
export function requireSimCognitoAnsweringUser(
  authResolver: SimCognitoAuthResolver,
  request: SimCognitoFirstFactorResponseRequest,
  now: Date,
): SimCognitoAnsweringUser {
  const { pool, client, parameters, challengeName } = request;
  const username = authResolver.username(client, parameters);
  const session = pool.auth.requireSession({
    sessionId: request.session,
    username,
    clientId: client.id,
    challengeName,
    now,
  });
  const user = requireSimCognitoSignInUser(pool, client, username);

  requireSimCognitoEnabled(user);

  return { session, user };
}
