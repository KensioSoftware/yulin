import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { SimCognitoManagedLoginRequired } from "../../error/sim-cognito-managed-login.error.js";
import {
  requireSimCognitoConfirmed,
  requireSimCognitoSignIn,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { simCognitoChallengeFactor } from "../auth/sim-cognito-mfa-factor-choice.js";
import type { SimCognitoAuthorizeInput } from "./hosted-auth.command.js";

/**
 * The credentials a local sign-in at the authorize endpoint carries.
 */
interface SimCognitoHostedCredentials {
  readonly username: string;
  readonly password: string;
}

/**
 * Signing one of a pool's own users in at the authorize endpoint.
 *
 * Real managed login takes the username and the password from its form and
 * checks them the way `InitiateAuth` checks them. The same user lookup, the
 * same refusal for a wrong password, and the same one for an account nobody
 * has confirmed. Those checks are called from here, so the two sign-ins stay
 * the same sign-in.
 *
 * Managed login has two more answers, and both are pages. A user owing a
 * second factor is asked for the code, and one holding a temporary password is
 * asked for a new one. Neither page is simulated, and a sign-in that would
 * reach one is refused here with a message saying which.
 */
export class SimCognitoHostedPasswordSignIn {
  /**
   * The user this request signs in, having checked its password.
   */
  signIn(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoAuthorizeInput,
  ): SimCognitoUser {
    const { username, password } = this.requiredCredentials(input);
    const user = requireSimCognitoSignInUser(pool, client, username);

    requireSimCognitoSignIn(user, password);
    requireSimCognitoConfirmed(user);

    this.requireNoFurtherPage(pool, user);

    return user;
  }

  /**
   * The username and password the request carried.
   *
   * A request carrying neither, and naming no identity provider, is one a
   * browser is shown the sign-in page for. The serving layer is what answers
   * with that page, from this refusal.
   */
  private requiredCredentials(
    input: SimCognitoAuthorizeInput,
  ): SimCognitoHostedCredentials {
    const { username, password } = input;

    if (
      username === undefined ||
      username === "" ||
      password === undefined ||
      password === ""
    ) {
      throw new SimCognitoManagedLoginRequired();
    }

    return { username, password };
  }

  /**
   * Refuse a sign-in real managed login answers with a page of its own.
   *
   * `simCognitoChallengeFactor` refuses the second factors it cannot
   * challenge for and answers with the ones it can, and neither is a code, so
   * a user with a factor is refused here whichever it has.
   */
  private requireNoFurtherPage(
    pool: SimCognitoUserPool,
    user: SimCognitoUser,
  ): void {
    if (user.status.mustChangePassword) {
      throw new SimCognitoInvalidParameterException(
        `User ${user.username} holds a temporary password, so real managed ` +
          `login would answer this sign-in with a page asking for a new one, ` +
          `which is not simulated. Set a permanent password on the user with ` +
          `AdminSetUserPassword.`,
      );
    }

    const factor = simCognitoChallengeFactor(pool, user);

    if (factor !== undefined) {
      throw new SimCognitoInvalidParameterException(
        `User ${user.username} is challenged for ${factor}, so real managed ` +
          `login would answer this sign-in with a page asking for the code, ` +
          `which is not simulated. Sign the user in with InitiateAuth, which ` +
          `answers the challenge this simulation issues.`,
      );
    }
  }
}
