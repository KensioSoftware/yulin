import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoAuthSession } from "../../user-pool/auth/sim-cognito-auth-session.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { requireSimCognitoAnsweringUser } from "./sim-cognito-answering-user.js";
import {
  simCognitoPasswordChallenge,
  simCognitoWebAuthnChallenge,
} from "./sim-cognito-available-challenges.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import {
  simCognitoSelectChallenge,
  type SimCognitoFirstFactorChallenge,
} from "./sim-cognito-first-factor-challenge.js";
import type { SimCognitoChallengeResponseRequest } from "./sim-cognito-new-password-response.js";
import type { SimCognitoPasswordResponse } from "./sim-cognito-password-response.js";
import type { SimCognitoWebAuthnResponse } from "./sim-cognito-web-authn-response.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoFirstFactorResponseProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly challenge: SimCognitoFirstFactorChallenge;
  readonly password: SimCognitoPasswordResponse;
  readonly webAuthn: SimCognitoWebAuthnResponse;
  readonly clock: SimClock;
}

/**
 * A response to one of the challenges a `USER_AUTH` sign-in issues.
 */
export interface SimCognitoFirstFactorResponseRequest extends SimCognitoChallengeResponseRequest {
  readonly challengeName: string;
}

/**
 * Answering the first factor of a choice-based sign-in.
 *
 * `SELECT_CHALLENGE` is answered with an `ANSWER` naming the factor the user
 * picked. Picking `WEB_AUTHN` is answered with that challenge and the options
 * a passkey is presented against, and picking `PASSWORD` carries the password
 * in the same request and finishes the sign-in, which is how the Cognito
 * documentation shows both.
 *
 * `PASSWORD` and `WEB_AUTHN` are what a sign-in that named a
 * `PREFERRED_CHALLENGE` is answered with, and each is completed here.
 *
 * A session is spent when the challenge it carries has been got past, and a
 * refusal leaves it standing, so a wrong password or a passkey the person
 * cancelled can be answered again. That is what real Cognito does with the
 * MFA challenges, and this holds the first factors to the same rule.
 */
export class SimCognitoFirstFactorResponse {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly challenge: SimCognitoFirstFactorChallenge;
  private readonly password: SimCognitoPasswordResponse;
  private readonly webAuthn: SimCognitoWebAuthnResponse;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoFirstFactorResponseProperties) {
    this.authResolver = properties.authResolver;
    this.challenge = properties.challenge;
    this.password = properties.password;
    this.webAuthn = properties.webAuthn;
    this.clock = properties.clock;
  }

  /**
   * Answer whichever of the three challenges the request names.
   */
  async handle(
    request: SimCognitoFirstFactorResponseRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { session, user } = requireSimCognitoAnsweringUser(
      this.authResolver,
      request,
      this.clock.now(),
    );

    if (request.challengeName === simCognitoWebAuthnChallenge) {
      return await this.webAuthn.complete(request, session, user);
    }

    if (request.challengeName === simCognitoSelectChallenge) {
      return await this.chosen(request, session, user);
    }

    return await this.password.complete(request, session, user);
  }

  /**
   * Act on the factor a `SELECT_CHALLENGE` response picked.
   */
  private async chosen(
    request: SimCognitoFirstFactorResponseRequest,
    session: SimCognitoAuthSession,
    user: SimCognitoUser,
  ): Promise<SimCognitoAuthenticationOutput> {
    const answer = request.parameters.require("ANSWER");

    if (answer === simCognitoPasswordChallenge) {
      return await this.password.complete(request, session, user);
    }

    const { pool, client } = request;
    const issued = this.challenge.issue(
      { pool, client, user },
      answer,
      "ANSWER",
    );

    // The choice is spent once it has been made, and the factor it picked is
    // what the next session is for. A choice this sign-in could not offer
    // leaves it standing, so the caller can pick again.
    pool.auth.removeSession(session);

    return issued;
  }
}
