import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoCodeMismatchException } from "../../error/sim-cognito.error.js";
import type { SimCognitoAuthSession } from "../../user-pool/auth/sim-cognito-auth-session.js";
import { simCognitoSmsMfa } from "../../user-pool/user/mfa/sim-cognito-mfa-factors.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";

/**
 * What a challenge response has to carry the right code for.
 */
interface SimCognitoMfaCodeRequest {
  readonly user: SimCognitoUser;
  readonly session: SimCognitoAuthSession;
  readonly parameters: SimCognitoAuthParameters;
}

/**
 * Whether a challenge response carries the code its challenge is waiting for.
 *
 * A texted code is compared with the one the pool sent, which the session
 * holds. An authenticator app's code is computed from the secret the user
 * registered, which is what makes a code from that secret work here as it
 * would against a deployment.
 */
export class SimCognitoMfaCodeCheck {
  private readonly clock: SimClock;

  constructor(clock: SimClock) {
    this.clock = clock;
  }

  /**
   * Refuse a code that is not the one this challenge is waiting for.
   */
  require(request: SimCognitoMfaCodeRequest): void {
    if (this.matches(request)) {
      return;
    }

    throw new SimCognitoCodeMismatchException("Invalid code received for user");
  }

  private matches(request: SimCognitoMfaCodeRequest): boolean {
    const { user, session, parameters } = request;

    if (session.challengeName === simCognitoSmsMfa) {
      return parameters.require("SMS_MFA_CODE") === session.code;
    }

    return (
      user.mfa.softwareToken?.matches(
        parameters.require("SOFTWARE_TOKEN_MFA_CODE"),
        this.clock.now(),
      ) ?? false
    );
  }
}
