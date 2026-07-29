import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requireSimCognitoSignInUser } from "../../user-pool/auth/sim-cognito-sign-in.js";
import { SimCognitoPasswordCheck } from "../../user-pool/sim-cognito-password-check.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoAuthRequest } from "./sim-cognito-password-sign-in.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoNewPasswordResponseProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly clock: SimClock;
}

/**
 * A challenge response, and the session tying it to the request that issued
 * the challenge.
 */
export interface SimCognitoChallengeResponseRequest extends SimCognitoAuthRequest {
  readonly session: string | undefined;
}

/**
 * Answering the `NEW_PASSWORD_REQUIRED` challenge.
 *
 * The new password is checked against the pool's policy, confirms the user,
 * and is what the user signs in with from then on. The session is single use,
 * so a replayed one fails. This is the body of both
 * `AdminRespondToAuthChallenge` and `RespondToAuthChallenge`, which differ only
 * in how they reach the pool.
 */
export class SimCognitoNewPasswordResponse {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly tokenIssuer: SimCognitoTokenIssuer;
  private readonly clock: SimClock;
  private readonly result = new SimCognitoAuthenticationResult();

  constructor(properties: SimCognitoNewPasswordResponseProperties) {
    this.authResolver = properties.authResolver;
    this.tokenIssuer = properties.tokenIssuer;
    this.clock = properties.clock;
  }

  /**
   * Complete the challenge, and sign the user in.
   */
  handle(
    request: SimCognitoChallengeResponseRequest,
  ): SimCognitoAuthenticationOutput {
    const { pool, client, parameters } = request;
    const username = this.authResolver.username(client, parameters);
    const session = pool.auth.requireSession({
      sessionId: request.session,
      username,
      clientId: client.id,
      now: this.clock.now(),
    });
    const user = requireSimCognitoSignInUser(pool, client, username);

    user.setPassword(
      new SimCognitoPasswordCheck(pool.passwordPolicy).require(
        "NEW_PASSWORD",
        parameters.find("NEW_PASSWORD"),
      ),
      true,
    );

    pool.auth.removeSession(session);

    return {
      $metadata: {},
      AuthenticationResult: this.result.of(
        this.tokenIssuer.issue({ pool, client, user }),
      ),
    };
  }
}
