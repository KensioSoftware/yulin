import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoAuthSession } from "../../user-pool/auth/sim-cognito-auth-session.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { newPasswordRequiredChallenge } from "./sim-cognito-auth-challenge.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoNewPasswordChallengeProperties {
  readonly clock: SimClock;
}

interface SimCognitoChallengeProperties {
  readonly pool: SimCognitoUserPool;
  readonly clientId: string;
  readonly user: SimCognitoUser;
}

/**
 * Issues the challenge a user has to get past before it can sign in.
 *
 * The session it hands back is what ties the response to this request, so it
 * is remembered on the pool rather than only returned.
 */
export class SimCognitoNewPasswordChallenge {
  private readonly clock: SimClock;

  constructor(properties: SimCognitoNewPasswordChallengeProperties) {
    this.clock = properties.clock;
  }

  /**
   * Answer with `NEW_PASSWORD_REQUIRED` and a session.
   */
  issue(
    properties: SimCognitoChallengeProperties,
  ): SimCognitoAuthenticationOutput {
    const { pool, clientId, user } = properties;
    const session = new SimCognitoAuthSession({
      username: user.username,
      clientId,
      challengeName: newPasswordRequiredChallenge,
      issuedAt: this.clock.now(),
    });

    pool.auth.addSession(session);

    return {
      $metadata: {},
      ChallengeName: newPasswordRequiredChallenge,
      Session: session.id,
      ChallengeParameters: {
        USER_ID_FOR_SRP: user.username,
        requiredAttributes: "[]",
        userAttributes: "{}",
      },
    };
  }
}
