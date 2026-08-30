import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import { SimCognitoGrantedTokens } from "./sim-cognito-granted-tokens.js";
import { SimCognitoPresentedGrant } from "./sim-cognito-presented-grant.js";
import type {
  SimCognitoTokenInput,
  SimCognitoTokenOutput,
} from "./hosted-auth.command.js";

interface SimCognitoTokenGrantsProperties {
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly clock: SimClock;
}

/**
 * The two grants the token endpoint answers.
 *
 * The tokens come from the pool's own token issuer rather than from anything
 * here, so a token from a hosted sign-in is the same token an API sign-in
 * issues, runs the same `PreTokenGeneration` trigger, and is remembered by the
 * pool the same way.
 */
export class SimCognitoTokenGrants {
  private readonly tokenIssuer: SimCognitoTokenIssuer;
  private readonly clock: SimClock;
  private readonly presented = new SimCognitoPresentedGrant();
  private readonly granted = new SimCognitoGrantedTokens();

  constructor(properties: SimCognitoTokenGrantsProperties) {
    this.tokenIssuer = properties.tokenIssuer;
    this.clock = properties.clock;
  }

  /**
   * Exchange an authorization code for tokens.
   *
   * The code is spent whether or not the rest of the request turns out to be
   * right, as real Cognito spends one, so nothing can be retried with a code
   * that has already been presented.
   *
   * The `PreTokenGeneration` source says which sign-in the grant came from.
   * A code from an identity provider reports `TokenGeneration_HostedAuth`, and
   * one from the pool's own sign-in form reports the
   * `TokenGeneration_Authentication` its API sign-in reports.
   */
  async exchangeCode(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoTokenInput,
  ): Promise<SimCognitoTokenOutput> {
    const code = this.presented.code({
      pool,
      client,
      input,
      now: this.clock.now(),
    });
    const user = this.presented.user(pool, code.username);
    const issued = await this.tokenIssuer.issue({
      pool,
      client,
      user,
      occasion: code.federated
        ? SimCognitoTriggerOccasion.hostedTokenGeneration
        : SimCognitoTriggerOccasion.tokenGeneration,
      scopes: code.scopes,
    });

    return this.granted.body(issued, code.scopes);
  }

  /**
   * Sign fresh tokens for an application that presented a refresh token.
   *
   * A new refresh token comes back only where the app client rotates its
   * refresh tokens, as one does from real Cognito, and the access token keeps
   * the scopes the sign-in it came from was granted.
   */
  async refresh(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoTokenInput,
  ): Promise<SimCognitoTokenOutput> {
    const refreshToken = this.presented.refreshToken({
      pool,
      client,
      input,
      now: this.clock.now(),
    });
    const user = this.presented.user(pool, refreshToken.username);
    const issued = await this.tokenIssuer.refresh({
      pool,
      client,
      user,
      spent: refreshToken,
      occasion: SimCognitoTriggerOccasion.refreshTokenGeneration,
      scopes: refreshToken.scopes,
    });

    return this.granted.body(issued, refreshToken.scopes);
  }
}
