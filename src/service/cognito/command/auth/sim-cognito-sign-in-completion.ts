import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import type { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import type { SimCognitoMfaChallenge } from "./sim-cognito-mfa-challenge.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoSignInCompletionProperties {
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly triggers: SimCognitoUserPoolTriggers;

  /** The second factor a user may still owe before it is signed in. */
  readonly mfaChallenge: SimCognitoMfaChallenge;
}

/**
 * A sign-in with nothing left in its way.
 */
interface SimCognitoCompletedSignIn {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly user: SimCognitoUser;

  /**
   * The `PreTokenGeneration` occasion these tokens are issued on, which says
   * which request finished the sign-in.
   */
  readonly occasion: SimCognitoTriggerOccasion;

  /**
   * The `ClientMetadata` to pass on to the token trigger, which only the
   * challenge responses have: real Cognito does not pass an `InitiateAuth`
   * request's on to that one.
   */
  readonly tokenClientMetadata?: Readonly<Record<string, string>> | undefined;

  /** The `ClientMetadata` `PostAuthentication` reads, which every request has. */
  readonly clientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * The last thing every finished sign-in does: issue the tokens, and run the
 * pool's `PostAuthentication` trigger.
 *
 * A sign-in can finish at the password, at the new password challenge or at an
 * MFA challenge, and all three end the same way, so they end in one place. The
 * order matters and is real Cognito's: the tokens are issued first and the
 * trigger runs after them, so a handler that throws leaves the sign-in it was
 * told about standing. The request itself still fails on the trigger, and the
 * caller is answered with the failure rather than with the tokens.
 *
 * The two that finish before the second factor go through
 * `challengeOrComplete`, which is where a user that registered one is
 * challenged instead.
 */
export class SimCognitoSignInCompletion {
  private readonly tokenIssuer: SimCognitoTokenIssuer;
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly mfaChallenge: SimCognitoMfaChallenge;
  private readonly result = new SimCognitoAuthenticationResult();

  constructor(properties: SimCognitoSignInCompletionProperties) {
    this.tokenIssuer = properties.tokenIssuer;
    this.triggers = properties.triggers;
    this.mfaChallenge = properties.mfaChallenge;
  }

  /**
   * Answer with the MFA challenge this user still owes, or with the tokens
   * where it owes none.
   */
  async challengeOrComplete(
    request: SimCognitoCompletedSignIn,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { pool, client, user, clientMetadata } = request;

    return (
      (await this.mfaChallenge.issueFor({
        pool,
        client,
        user,
        clientMetadata,
      })) ?? (await this.complete(request))
    );
  }

  /**
   * Answer with the tokens this sign-in earned.
   */
  async complete(
    request: SimCognitoCompletedSignIn,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { pool, client, user, clientMetadata } = request;
    const authenticated = {
      $metadata: {},
      AuthenticationResult: this.result.of(
        await this.tokenIssuer.issue({
          pool,
          client,
          user,
          occasion: request.occasion,
          clientMetadata: request.tokenClientMetadata,
        }),
      ),
    };

    await this.triggers.postAuthentication({
      pool,
      client,
      user,
      clientMetadata,
    });

    return authenticated;
  }
}
