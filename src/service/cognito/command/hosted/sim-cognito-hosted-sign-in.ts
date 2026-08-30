import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoManagedLoginRequired } from "../../error/sim-cognito-managed-login.error.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoFederatedSignIn } from "../../user-pool/idp/sim-cognito-federated-sign-in.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoFirstFactorChallenge } from "../auth/sim-cognito-first-factor-challenge.js";
import { SimCognitoAuthorizeRequest } from "./sim-cognito-authorize-request.js";
import { SimCognitoBrowserSession } from "./sim-cognito-browser-session.js";
import { SimCognitoHostedCredentials } from "./sim-cognito-hosted-credentials.js";
import { SimCognitoHostedPasskeySignIn } from "./sim-cognito-hosted-passkey-sign-in.js";
import { SimCognitoHostedPasswordSignIn } from "./sim-cognito-hosted-password-sign-in.js";
import type { SimCognitoHostedSignedIn } from "./sim-cognito-hosted-signed-in.js";
import type { SimCognitoAuthorizeInput } from "./hosted-auth.command.js";

interface SimCognitoHostedSignInProperties {
  readonly federatedSignIn: SimCognitoFederatedSignIn;

  /**
   * The challenge issuer the API sign-ins use, which a passkey at the hosted
   * domain is asked for through.
   */
  readonly challenge: SimCognitoFirstFactorChallenge;
  readonly clock: SimClock;

  /**
   * The trigger runner the API sign-ins use, which a sign-in at this endpoint
   * runs the pool's `PreAuthentication` through.
   */
  readonly triggers: SimCognitoUserPoolTriggers;
}

/**
 * Which user an authorize request signs in.
 *
 * Real Cognito has three answers here. A request naming an identity provider
 * goes to that provider's own sign-in page. A request carrying credentials is
 * managed login's form coming back. A request carrying neither is answered by
 * the browser's own managed login session, and by the form where the browser
 * holds none. What comes back is the pool user the authorization code is
 * issued for, and what the browser should hold afterwards.
 */
export class SimCognitoHostedSignIn {
  private readonly federatedSignIn: SimCognitoFederatedSignIn;
  private readonly clock: SimClock;
  private readonly request = new SimCognitoAuthorizeRequest();
  private readonly passwordSignIn: SimCognitoHostedPasswordSignIn;
  private readonly passkeySignIn: SimCognitoHostedPasskeySignIn;
  private readonly browserSession = new SimCognitoBrowserSession();

  constructor(properties: SimCognitoHostedSignInProperties) {
    this.federatedSignIn = properties.federatedSignIn;
    this.clock = properties.clock;
    this.passwordSignIn = new SimCognitoHostedPasswordSignIn({
      triggers: properties.triggers,
    });
    this.passkeySignIn = new SimCognitoHostedPasskeySignIn({
      challenge: properties.challenge,
      clock: properties.clock,
      triggers: properties.triggers,
    });
  }

  /**
   * The user this request signs in, at a provider, in the pool itself, or from
   * the managed login session the browser presented.
   */
  async signIn(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoAuthorizeInput,
    presentedSession: string | undefined,
  ): Promise<SimCognitoHostedSignedIn> {
    const provider = this.request.signInProvider(pool, client, input);

    if (provider === undefined) {
      return this.localSignIn(pool, client, input, presentedSession);
    }

    const now = this.clock.now();
    const user = await this.federatedSignIn.signIn({
      pool,
      client,
      provider,
      now,
    });

    return this.browserSession.start(pool, user, now).asFederated();
  }

  /**
   * Sign in one of the pool's own users, with a passkey, with a password, or
   * from the session the browser is already holding.
   *
   * A passkey takes two requests. The first asks for one and is answered with
   * a challenge, and the second presents the credential answering it. A
   * password takes one. Either wins over a session the browser is holding,
   * because real managed login answers a form post with a fresh sign-in. A
   * request carrying none of them, from a browser holding no session, is one
   * the sign-in form is shown for. The serving layer answers with that page,
   * from this refusal.
   */
  private async localSignIn(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoAuthorizeInput,
    presentedSession: string | undefined,
  ): Promise<SimCognitoHostedSignedIn> {
    const now = this.clock.now();

    const { username, credential } = input;

    if (username !== undefined && credential !== undefined) {
      return this.browserSession.start(
        pool,
        this.passkeySignIn.present(pool, client, {
          username,
          credential,
          session: input.passkey_session,
        }),
        now,
      );
    }

    if (username !== undefined && input.passkey !== undefined) {
      await this.passkeySignIn.ask(pool, client, username);
    }

    const credentials = SimCognitoHostedCredentials.in(input);

    if (credentials === undefined) {
      const returning = this.browserSession.signIn(pool, presentedSession, now);

      if (returning === undefined) {
        throw new SimCognitoManagedLoginRequired();
      }

      return returning;
    }

    const user = await this.passwordSignIn.signIn(pool, client, credentials);

    return this.browserSession.start(pool, user, now);
  }
}
