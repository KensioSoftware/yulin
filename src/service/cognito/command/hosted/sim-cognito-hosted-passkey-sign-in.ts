import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import {
  requireSimCognitoConfirmed,
  requireSimCognitoEnabled,
  requireSimCognitoPasswordSet,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import {
  requireSimCognitoRelyingParty,
  simCognitoUserVerification,
} from "../../user-pool/mfa/sim-cognito-relying-party.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import {
  requireSimCognitoWebAuthnAssertion,
  simCognitoWebAuthnRequestOptions,
} from "../../user-pool/user/web-authn/sim-cognito-web-authn-assertion.js";
import { simCognitoWebAuthnChallenge } from "../auth/sim-cognito-available-challenges.js";

/**
 * Signing one of a pool's own users in at the authorize endpoint with a
 * passkey.
 *
 * Real managed login offers a passkey where the pool allows one, and the
 * browser runs the ceremony with the person's own authenticator before posting
 * the credential back. There is no browser here and no authenticator, so the
 * simulator runs both halves. It builds the same request options a `WEB_AUTHN`
 * challenge would, presents the user's registered passkey against them, and
 * checks the signature against the public key the registration stored.
 *
 * A passkey meets the pool's second factor as well as its first, so a user
 * that has registered one signs in here where the password form would answer
 * with a page asking for a code.
 */
export class SimCognitoHostedPasskeySignIn {
  /**
   * Refuse a passkey at a pool that does not allow one first.
   */
  private static requireAllowed(pool: SimCognitoUserPool): void {
    if (
      pool.settings.signInPolicy.factors.includes(simCognitoWebAuthnChallenge)
    ) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `This user pool does not allow a passkey at the first prompt: name ` +
        `WEB_AUTHN among the SignInPolicy AllowedFirstAuthFactors of the pool.`,
    );
  }

  /**
   * The user this passkey signs in, having presented it.
   */
  signIn(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    username: string,
  ): SimCognitoUser {
    SimCognitoHostedPasskeySignIn.requireAllowed(pool);

    const user = requireSimCognitoSignInUser(pool, client, username);

    requireSimCognitoEnabled(user);
    requireSimCognitoConfirmed(user);
    requireSimCognitoPasswordSet(user);

    const options = simCognitoWebAuthnRequestOptions(
      requireSimCognitoRelyingParty(pool),
      simCognitoUserVerification(pool),
      user.webAuthn.credentials.map((each) => each.descriptor()),
    );

    requireSimCognitoWebAuthnAssertion(
      user.webAuthn.credentials,
      user.webAuthn.device.present(
        options,
        Buffer.from(user.sub).toString("base64url"),
      ),
      options,
    );

    return user;
  }
}
