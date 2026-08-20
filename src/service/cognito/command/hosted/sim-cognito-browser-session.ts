import { SimCognitoManagedLoginSession } from "../../user-pool/auth/sim-cognito-managed-login-session.js";
import { requireSimCognitoEnabled } from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { SimCognitoHostedSignedIn } from "./sim-cognito-hosted-signed-in.js";
import { SimCognitoSessionChange } from "./sim-cognito-session-change.js";

/**
 * The managed login session a browser holds at a pool's hosted domain.
 *
 * Real managed login starts one whenever a user signs in at the domain, with
 * its own credentials or at an identity provider, and answers an authorize
 * request carrying it with a code and no further questions. That is what makes
 * a sign-out which clears the application's own cookies and revokes the user's
 * tokens leave the browser signed in here.
 */
export class SimCognitoBrowserSession {
  /**
   * Start a session for a browser that has just signed in.
   */
  start(
    pool: SimCognitoUserPool,
    user: SimCognitoUser,
    now: Date,
  ): SimCognitoHostedSignedIn {
    const session = new SimCognitoManagedLoginSession({
      username: user.username,
      startedAt: now,
    });

    pool.auth.addManagedLoginSession(session);

    return new SimCognitoHostedSignedIn({
      user,
      session: SimCognitoSessionChange.started(session.value),
    });
  }

  /**
   * The user the session a browser presented signs in, where it still has one.
   *
   * Real Cognito lets attribute and authentication changes go by without
   * disturbing the session, so nothing is rechecked but the user itself. A
   * user deleted since the session started leaves it with nobody to sign in,
   * and a disabled user is refused the way every other sign-in refuses one.
   */
  signIn(
    pool: SimCognitoUserPool,
    presented: string | undefined,
    now: Date,
  ): SimCognitoHostedSignedIn | undefined {
    const session = pool.auth.findManagedLoginSession(presented, now);

    if (session === undefined) {
      return undefined;
    }

    const user = pool.findUser(session.username);

    if (user === undefined) {
      pool.auth.endManagedLoginSession(session.value);

      return undefined;
    }

    requireSimCognitoEnabled(user);

    return new SimCognitoHostedSignedIn({
      user,
      session: SimCognitoSessionChange.reused(),
    });
  }
}
