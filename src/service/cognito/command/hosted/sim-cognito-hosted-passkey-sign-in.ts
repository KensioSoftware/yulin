import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoPasskeyRequired } from "../../error/sim-cognito-managed-login.error.js";
import {
  requireSimCognitoReadyToSignIn,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { requireSimCognitoWebAuthnAssertion } from "../../user-pool/user/web-authn/sim-cognito-web-authn-assertion.js";
import { SimCognitoAuthParameters } from "../auth/sim-cognito-auth-parameters.js";
import { simCognitoWebAuthnChallenge } from "../auth/sim-cognito-available-challenges.js";
import type { SimCognitoFirstFactorChallenge } from "../auth/sim-cognito-first-factor-challenge.js";

/**
 * The passkey a form has just presented.
 */
export interface SimCognitoPresentedPasskey {
  readonly username: string;

  /** The JSON a browser serializes a `PublicKeyCredential` to. */
  readonly credential: string;

  /** The challenge session the credential answers. */
  readonly session: string | undefined;
}

interface SimCognitoHostedPasskeySignInProperties {
  /**
   * The challenge issuer the API sign-ins use, so a passkey presented at the
   * hosted domain answers the same kind of challenge as one presented through
   * `InitiateAuth`.
   */
  readonly challenge: SimCognitoFirstFactorChallenge;
  readonly clock: SimClock;
  readonly triggers: SimCognitoUserPoolTriggers;
}

/**
 * Signing one of a pool's own users in at the authorize endpoint with a
 * passkey.
 *
 * It takes two requests, as it does on real managed login. The first names the
 * user and asks for a passkey, and the pool answers with a challenge. The
 * second presents the credential answering it, and the signature is checked
 * against the public key the registration stored.
 *
 * Real managed login runs the ceremony between the two, in the browser, with
 * the person's own authenticator. These pages serve no script, so the
 * simulation asks for the credential instead and a caller presents it.
 * `SimCognitoUserPool.webAuthnAssertion` is what a test reads it from. Nothing
 * here signs in on a username alone, because a passkey a caller does not hold
 * is a passkey it cannot present.
 *
 * A passkey meets the pool's second factor as well as its first, so a user
 * that has registered one signs in here where the password form would answer
 * with a page asking for a code.
 */
export class SimCognitoHostedPasskeySignIn {
  private readonly challenge: SimCognitoFirstFactorChallenge;
  private readonly clock: SimClock;
  private readonly triggers: SimCognitoUserPoolTriggers;

  constructor(properties: SimCognitoHostedPasskeySignInProperties) {
    this.challenge = properties.challenge;
    this.clock = properties.clock;
    this.triggers = properties.triggers;
  }

  /**
   * Ask this user for a passkey, or refuse where the pool allows none and
   * where the user has registered none.
   *
   * `PreAuthentication` runs here rather than where the credential comes back,
   * because this is the request that starts the sign-in. A `USER_AUTH`
   * sign-in runs it in the same place, on the `InitiateAuth` that asks for a
   * factor, and the challenge response that answers runs it no second time.
   * Only a request that has been asked holds a session to answer with, so
   * every passkey sign-in passes through here exactly once.
   */
  async ask(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    username: string,
  ): Promise<never> {
    const user = requireSimCognitoSignInUser(pool, client, username);

    await this.triggers.preAuthentication({ pool, client, user });

    requireSimCognitoReadyToSignIn(user);

    const asked = this.challenge.issue(
      { pool, client, user },
      simCognitoWebAuthnChallenge,
      "passkey",
    );

    throw new SimCognitoPasskeyRequired(username, String(asked.Session));
  }

  /**
   * The user the presented credential signs in, having checked that this
   * user's passkey signed the challenge the pool issued.
   *
   * The user is resolved before the session is, because the form posts back
   * whatever the page carried, and on a pool with `UsernameAttributes` that is
   * the address the person signed in by rather than the username the pool
   * generated. The session belongs to the user, so the username it is looked
   * up by has to be the resolved one.
   */
  present(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    presented: SimCognitoPresentedPasskey,
  ): SimCognitoUser {
    const user = this.signingIn(pool, client, presented.username);
    const session = pool.auth.requireSession({
      sessionId: presented.session,
      username: user.username,
      clientId: client.id,
      challengeName: simCognitoWebAuthnChallenge,
      now: this.clock.now(),
    });

    requireSimCognitoWebAuthnAssertion(
      user.webAuthn.credentials,
      new SimCognitoAuthParameters("the managed login form", {
        credential: presented.credential,
      }).requireDocument("credential"),
      session.requireWebAuthnOptions(),
    );

    pool.auth.removeSession(session);

    return user;
  }

  /**
   * The user this sign-in names, held to what every sign-in holds a user to.
   */
  private signingIn(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    username: string,
  ): SimCognitoUser {
    const user = requireSimCognitoSignInUser(pool, client, username);

    requireSimCognitoReadyToSignIn(user);

    return user;
  }
}
