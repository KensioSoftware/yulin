import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  requireSimCognitoEnabled,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import { SimCognitoPasswordCheck } from "../../user-pool/sim-cognito-password-check.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoAuthRequest } from "./sim-cognito-password-sign-in.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoNewPasswordResponseProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly triggers: SimCognitoUserPoolTriggers;
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
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly clock: SimClock;
  private readonly result = new SimCognitoAuthenticationResult();

  constructor(properties: SimCognitoNewPasswordResponseProperties) {
    this.authResolver = properties.authResolver;
    this.tokenIssuer = properties.tokenIssuer;
    this.triggers = properties.triggers;
    this.clock = properties.clock;
  }

  /**
   * Complete the challenge, and sign the user in.
   *
   * This is where the sign-in the challenge interrupted finishes, so it is
   * where the pool's `PostAuthentication` trigger runs. `PreAuthentication`
   * does not run again: it ran when the challenge was issued, and real Cognito
   * fires it once per sign-in rather than once per request.
   */
  async handle(
    request: SimCognitoChallengeResponseRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { pool, client, parameters } = request;
    const username = this.authResolver.username(client, parameters);
    const session = pool.auth.requireSession({
      sessionId: request.session,
      username,
      clientId: client.id,
      now: this.clock.now(),
    });
    const user = requireSimCognitoSignInUser(pool, client, username);

    // A user disabled between the challenge and this response cannot finish
    // the sign-in, as it cannot start one.
    requireSimCognitoEnabled(user);

    user.setPassword(
      new SimCognitoPasswordCheck(pool.passwordPolicy).require(
        "NEW_PASSWORD",
        parameters.find("NEW_PASSWORD"),
      ),
      true,
    );

    pool.auth.removeSession(session);

    const authenticated = {
      $metadata: {},
      AuthenticationResult: this.result.of(
        this.tokenIssuer.issue({ pool, client, user }),
      ),
    };

    await this.triggers.postAuthentication({
      pool,
      client,
      user,
      clientMetadata: request.clientMetadata,
    });

    return authenticated;
  }
}
