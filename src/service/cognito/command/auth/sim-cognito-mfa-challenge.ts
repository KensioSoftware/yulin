import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoAuthSession } from "../../user-pool/auth/sim-cognito-auth-session.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoPoolMessenger } from "../../user-pool/message/sim-cognito-pool-messenger.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { simCognitoSmsMfa } from "../../user-pool/user/mfa/sim-cognito-mfa-factors.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { simCognitoChallengeFactor } from "./sim-cognito-mfa-factor-choice.js";
import {
  simCognitoMaskedDestination,
  simCognitoMfaCode,
} from "./sim-cognito-mfa-code.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoMfaChallengeProperties {
  readonly messenger: SimCognitoPoolMessenger;
  readonly clock: SimClock;
}

/**
 * A sign-in that has got past the password and may have a factor to answer
 * for.
 */
interface SimCognitoMfaChallengeRequest {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly user: SimCognitoUser;
  readonly clientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * The multi-factor challenge a pool answers a sign-in with.
 *
 * A user that has registered a factor is challenged for it: `SMS_MFA` for a
 * phone number, which the pool texts a code to, and `SOFTWARE_TOKEN_MFA` for
 * an authenticator app, whose code the user reads off its own device. Either
 * way the request that carried the password is answered with a challenge and a
 * session rather than with tokens, and `SimCognitoMfaResponse` is what
 * completes it.
 *
 * A pool configured `OFF` challenges nobody. One configured `OPTIONAL`
 * challenges the users that registered a factor, and one configured `ON`
 * challenges every user, which is the case this simulation still cannot serve
 * in full: real Cognito answers a user with no factor with `MFA_SETUP`, which
 * registers one mid-sign-in, so that sign-in is refused here rather than
 * handed tokens a deployment would not have handed out.
 */
export class SimCognitoMfaChallenge {
  private readonly messenger: SimCognitoPoolMessenger;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoMfaChallengeProperties) {
    this.messenger = properties.messenger;
    this.clock = properties.clock;
  }

  /**
   * Where the code went, for the factor that sends one.
   *
   * Real Cognito reports the medium and a masked destination on an `SMS_MFA`
   * challenge, and neither on a `SOFTWARE_TOKEN_MFA` one, because nothing was
   * sent anywhere for that.
   */
  private static deliveryParameters(
    factor: string,
    user: SimCognitoUser,
  ): Record<string, string> {
    const destination = user.attributeValues.get("phone_number");

    if (factor !== simCognitoSmsMfa || destination === undefined) {
      return {};
    }

    return {
      CODE_DELIVERY_DELIVERY_MEDIUM: "SMS",
      CODE_DELIVERY_DESTINATION: simCognitoMaskedDestination(destination),
    };
  }

  /**
   * The challenge this user has to get past, or nothing where it has none.
   *
   * A sign-in that gets nothing back from here is one that can be answered
   * with tokens.
   */
  async issueFor(
    request: SimCognitoMfaChallengeRequest,
  ): Promise<SimCognitoAuthenticationOutput | undefined> {
    const factor = simCognitoChallengeFactor(request.pool, request.user);

    if (factor === undefined) {
      return undefined;
    }

    const { pool, client, user } = request;
    const code = factor === simCognitoSmsMfa ? simCognitoMfaCode() : undefined;
    const session = new SimCognitoAuthSession({
      username: user.username,
      client,
      challengeName: factor,
      code,
      issuedAt: this.clock.now(),
    });

    pool.auth.addSession(session);

    if (code !== undefined) {
      await this.messenger.send({
        pool,
        client,
        user,
        occasion: "Authentication",
        code,
        clientMetadata: request.clientMetadata,
      });
    }

    return {
      $metadata: {},
      ChallengeName: factor,
      Session: session.id,
      ChallengeParameters: {
        USER_ID_FOR_SRP: user.username,
        ...SimCognitoMfaChallenge.deliveryParameters(factor, user),
      },
    };
  }
}
