import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoAuthSession } from "../../user-pool/auth/sim-cognito-auth-session.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import {
  requireSimCognitoRelyingParty,
  simCognitoUserVerification,
} from "../../user-pool/mfa/sim-cognito-relying-party.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { simCognitoWebAuthnRequestOptions } from "../../user-pool/user/web-authn/sim-cognito-web-authn-assertion.js";
import {
  requireSimCognitoAvailableChallenge,
  simCognitoAvailableChallenges,
  simCognitoWebAuthnChallenge,
} from "./sim-cognito-available-challenges.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

/**
 * The challenge a pool answers a choice-based sign-in with when the request
 * named no preference.
 */
export const simCognitoSelectChallenge = "SELECT_CHALLENGE";

interface SimCognitoFirstFactorChallengeProperties {
  readonly clock: SimClock;
}

/**
 * A sign-in that has found its user and has a factor left to ask for.
 */
export interface SimCognitoFirstFactorRequest {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly user: SimCognitoUser;
}

/**
 * The first factor a `USER_AUTH` sign-in asks for.
 *
 * A request naming no `PREFERRED_CHALLENGE` is answered with
 * `SELECT_CHALLENGE` and the factors this user could present, and the caller
 * picks one through `RespondToAuthChallenge`. A request naming one is answered
 * with that challenge directly. Either way the answer carries a session, and
 * `SimCognitoFirstFactorResponse` is what completes it.
 */
export class SimCognitoFirstFactorChallenge {
  private readonly clock: SimClock;

  constructor(properties: SimCognitoFirstFactorChallengeProperties) {
    this.clock = properties.clock;
  }

  /**
   * Answer with the factors this user could present, and a session to come
   * back with.
   */
  offer(request: SimCognitoFirstFactorRequest): SimCognitoAuthenticationOutput {
    const { pool, user } = request;

    return {
      ...this.answer(request, simCognitoSelectChallenge),
      AvailableChallenges: [...simCognitoAvailableChallenges(pool, user)],
    };
  }

  /**
   * Answer with one named factor, or refuse one this sign-in cannot offer.
   */
  issue(
    request: SimCognitoFirstFactorRequest,
    challengeName: string,
    field: string,
  ): SimCognitoAuthenticationOutput {
    const { pool, user } = request;

    requireSimCognitoAvailableChallenge(
      challengeName,
      simCognitoAvailableChallenges(pool, user),
      field,
    );

    if (challengeName === simCognitoWebAuthnChallenge) {
      return this.presentPasskey(request);
    }

    return this.answer(request, challengeName);
  }

  /**
   * Ask for a passkey, carrying the options a browser presents one against.
   *
   * The options live on the session as well as in the answer, because the
   * challenge inside them is what the credential coming back has to sign.
   */
  private presentPasskey(
    request: SimCognitoFirstFactorRequest,
  ): SimCognitoAuthenticationOutput {
    const { pool, client, user } = request;
    const options = simCognitoWebAuthnRequestOptions(
      requireSimCognitoRelyingParty(pool),
      simCognitoUserVerification(pool),
      user.webAuthn.credentials.map((each) => each.descriptor()),
    );
    const session = this.remember(
      pool,
      client,
      user,
      simCognitoWebAuthnChallenge,
      options,
    );

    return {
      $metadata: {},
      ChallengeName: simCognitoWebAuthnChallenge,
      Session: session.id,
      ChallengeParameters: {
        USERNAME: user.username,
        CREDENTIAL_REQUEST_OPTIONS: JSON.stringify(options),
      },
    };
  }

  private answer(
    request: SimCognitoFirstFactorRequest,
    challengeName: string,
  ): SimCognitoAuthenticationOutput {
    const { pool, client, user } = request;

    return {
      $metadata: {},
      ChallengeName: challengeName,
      Session: this.remember(pool, client, user, challengeName).id,
      ChallengeParameters: { USERNAME: user.username },
    };
  }

  private remember(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    user: SimCognitoUser,
    challengeName: string,
    webAuthnOptions?: ReturnType<typeof simCognitoWebAuthnRequestOptions>,
  ): SimCognitoAuthSession {
    const session = new SimCognitoAuthSession({
      username: user.username,
      client,
      challengeName,
      issuedAt: this.clock.now(),
      webAuthnOptions,
    });

    pool.auth.addSession(session);

    return session;
  }
}
