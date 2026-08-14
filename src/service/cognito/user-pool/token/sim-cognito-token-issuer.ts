import { randomBytes, randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoIssuedToken } from "../auth/sim-cognito-issued-token.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoTriggerOccasion } from "../trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import { SimCognitoAccessToken } from "./sim-cognito-access-token.js";
import type { SimCognitoClaimsOverride } from "./sim-cognito-claims-override.js";
import { SimCognitoIdToken } from "./sim-cognito-id-token.js";

/**
 * How many bytes a refresh token carries.
 *
 * A real refresh token is an opaque string rather than a JWT, so this is one
 * too. What it means is held on the pool that issued it, which is where
 * `REFRESH_TOKEN_AUTH` looks it up.
 */
const refreshTokenBytes = 48;

/**
 * The tokens one authentication produced.
 *
 * `refreshToken` is absent from a token refresh, because real Cognito answers
 * `REFRESH_TOKEN_AUTH` with a new access and id token and no new refresh
 * token.
 */
export interface SimCognitoIssuedTokens {
  readonly idToken: string;
  readonly accessToken: string;
  readonly refreshToken?: string | undefined;
  readonly expiresIn: number;
}

interface SimCognitoTokenIssuerProperties {
  readonly clock: SimClock;
  readonly triggers: SimCognitoUserPoolTriggers;
}

interface SimCognitoIssueTokensProperties {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly user: SimCognitoUser;

  /**
   * What the pool is issuing tokens for, which is what a `PreTokenGeneration`
   * handler reads as its `triggerSource`.
   */
  readonly occasion: SimCognitoTriggerOccasion;

  /**
   * The `ClientMetadata` the request carried, which reaches the token trigger
   * from a challenge response and from nowhere else, as on real Cognito.
   */
  readonly clientMetadata?: Readonly<Record<string, string>> | undefined;

  /**
   * The scopes a hosted sign-in was granted, which reach the access token's
   * `scope` claim. A sign-in through the API grants none of its own.
   */
  readonly scopes?: readonly string[] | undefined;
}

/**
 * Issues the tokens a successful authentication answers with.
 *
 * Every timestamp comes from the simulation's clock rather than from
 * `new Date()`, so advancing simulated time expires a token that was valid
 * before it, and a test can exercise the expiry handling it would otherwise
 * have to wait an hour for.
 *
 * What it issues is remembered on the pool, because the pool is what a refresh
 * or a sign-out presents a token back to.
 *
 * The pool's `PreTokenGeneration` trigger runs here, because this is where the
 * claims of a token are settled. It runs on a refresh as well as on a sign-in,
 * so a claim a handler changed between the two is not stale on the reissued
 * token.
 */
export class SimCognitoTokenIssuer {
  private readonly clock: SimClock;
  private readonly triggers: SimCognitoUserPoolTriggers;

  constructor(properties: SimCognitoTokenIssuerProperties) {
    this.clock = properties.clock;
    this.triggers = properties.triggers;
  }

  private static expiryOf(issuedAt: Date, seconds: number): Date {
    return new Date(issuedAt.getTime() + seconds * 1000);
  }

  /**
   * Sign an id token and an access token for a user, and mint a refresh
   * token to go with them.
   *
   * The two JWTs last as long as the app client says, which is an hour each
   * unless the client was created with its own validity, and the refresh token
   * lasts the thirty days real Cognito gives one by default.
   *
   * The refresh token is minted after the JWTs are signed, so a
   * `PreTokenGeneration` handler that refuses the request leaves the pool
   * holding no token from a sign-in that never answered with one.
   */
  async issue(
    properties: SimCognitoIssueTokensProperties,
  ): Promise<SimCognitoIssuedTokens> {
    const { pool, client, user } = properties;
    const issuedAt = this.clock.now();
    const signed = await this.signTokens(properties, issuedAt);
    const refreshToken = randomBytes(refreshTokenBytes).toString("base64url");

    pool.auth.addRefreshToken(
      new SimCognitoIssuedToken({
        value: refreshToken,
        username: user.username,
        clientId: client.id,
        issuedAt,
        expiresAt: SimCognitoTokenIssuer.expiryOf(
          issuedAt,
          client.tokenValidity.refreshToken.seconds,
        ),
        // A hosted sign-in was granted scopes, and the tokens a refresh hands
        // out later carry the same ones.
        scopes: properties.scopes,
      }),
    );

    return { ...signed, refreshToken };
  }

  /**
   * Sign a fresh id token and access token for a user that presented a refresh
   * token.
   *
   * No new refresh token comes with them, as none does on real Cognito with
   * refresh token rotation off, so the caller keeps using the one it has until
   * that expires.
   */
  async reissue(
    properties: SimCognitoIssueTokensProperties,
  ): Promise<SimCognitoIssuedTokens> {
    return await this.signTokens(properties, this.clock.now());
  }

  private async signTokens(
    properties: SimCognitoIssueTokensProperties,
    issuedAt: Date,
  ): Promise<SimCognitoIssuedTokens> {
    const { pool, client, user } = properties;
    const claimsOverride = await this.claimsOverride(properties);
    const accessTokenSeconds = client.tokenValidity.accessToken.seconds;
    const accessTokenExpiresAt = SimCognitoTokenIssuer.expiryOf(
      issuedAt,
      accessTokenSeconds,
    );

    const idToken = new SimCognitoIdToken({
      ...properties,
      issuedAt,
      expiresAt: SimCognitoTokenIssuer.expiryOf(
        issuedAt,
        client.tokenValidity.idToken.seconds,
      ),
      tokenId: randomUUID(),
    });

    const accessToken = new SimCognitoAccessToken({
      ...properties,
      issuedAt,
      expiresAt: accessTokenExpiresAt,
      tokenId: randomUUID(),
    });

    // A V1_0 trigger customises the id token, and the one change it makes to an
    // access token is the group override, which is why the access token is
    // signed with that alone applied.
    const signedAccessToken = pool.signingKey.sign(
      claimsOverride.applyGroupsTo(accessToken.claims()),
    );

    pool.auth.addAccessToken(
      new SimCognitoIssuedToken({
        value: signedAccessToken,
        username: user.username,
        clientId: client.id,
        issuedAt,
        expiresAt: accessTokenExpiresAt,
      }),
    );

    return {
      idToken: pool.signingKey.sign(claimsOverride.applyTo(idToken.claims())),
      accessToken: signedAccessToken,
      expiresIn: accessTokenSeconds,
    };
  }

  private async claimsOverride(
    properties: SimCognitoIssueTokensProperties,
  ): Promise<SimCognitoClaimsOverride> {
    const { pool, client, user, occasion, clientMetadata } = properties;

    return await this.triggers.preTokenGeneration(occasion, {
      pool,
      client,
      user,
      clientMetadata,
    });
  }
}
