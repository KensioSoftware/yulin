import { randomBytes, randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import { SimCognitoAccessToken } from "./sim-cognito-access-token.js";
import { SimCognitoIdToken } from "./sim-cognito-id-token.js";

/**
 * How many bytes a refresh token carries.
 *
 * A real refresh token is an opaque string rather than a JWT, so this is one
 * too. Nothing here consumes it: `REFRESH_TOKEN_AUTH` is not simulated.
 */
const refreshTokenBytes = 48;

/**
 * The tokens one authentication produced.
 */
export interface SimCognitoIssuedTokens {
  readonly idToken: string;
  readonly accessToken: string;
  readonly refreshToken: string;
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
   * unless the client was created with its own validity.
   */
  issue(properties: SimCognitoIssueTokensProperties): SimCognitoIssuedTokens {
    const { pool, client } = properties;
    const issuedAt = this.clock.now();
    const accessTokenSeconds = client.tokenValidity.accessToken.seconds;

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
      expiresAt: SimCognitoTokenIssuer.expiryOf(issuedAt, accessTokenSeconds),
      tokenId: randomUUID(),
    });

    return {
      idToken: pool.signingKey.sign(idToken.claims()),
      accessToken: pool.signingKey.sign(accessToken.claims()),
      refreshToken: randomBytes(refreshTokenBytes).toString("base64url"),
      expiresIn: accessTokenSeconds,
    };
  }
}
