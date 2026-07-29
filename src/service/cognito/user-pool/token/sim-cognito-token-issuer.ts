import { randomBytes, randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoIssuedToken } from "../auth/sim-cognito-issued-token.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import { SimCognitoAccessToken } from "./sim-cognito-access-token.js";
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
}

interface SimCognitoIssueTokensProperties {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly user: SimCognitoUser;
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
 */
export class SimCognitoTokenIssuer {
  private readonly clock: SimClock;

  constructor(properties: SimCognitoTokenIssuerProperties) {
    this.clock = properties.clock;
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
   */
  issue(properties: SimCognitoIssueTokensProperties): SimCognitoIssuedTokens {
    const { pool, client, user } = properties;
    const issuedAt = this.clock.now();
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
      }),
    );

    return { ...this.signTokens(properties, issuedAt), refreshToken };
  }

  /**
   * Sign a fresh id token and access token for a user that presented a refresh
   * token.
   *
   * No new refresh token comes with them, as none does on real Cognito with
   * refresh token rotation off, so the caller keeps using the one it has until
   * that expires.
   */
  reissue(properties: SimCognitoIssueTokensProperties): SimCognitoIssuedTokens {
    return this.signTokens(properties, this.clock.now());
  }

  private signTokens(
    properties: SimCognitoIssueTokensProperties,
    issuedAt: Date,
  ): SimCognitoIssuedTokens {
    const { pool, client, user } = properties;
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

    const signedAccessToken = pool.signingKey.sign(accessToken.claims());

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
      idToken: pool.signingKey.sign(idToken.claims()),
      accessToken: signedAccessToken,
      expiresIn: accessTokenSeconds,
    };
  }
}
