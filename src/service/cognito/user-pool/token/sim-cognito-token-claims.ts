import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoIdentityClaim } from "../idp/sim-cognito-federated-identity.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";

export type SimCognitoClaimValue =
  | string
  | number
  | readonly string[]
  | readonly SimCognitoIdentityClaim[];

/**
 * The claims of one token, in the shape they are signed in.
 */
export type SimCognitoTokenClaims = Readonly<
  Record<string, SimCognitoClaimValue>
>;

export interface SimCognitoTokenClaimsProperties {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly user: SimCognitoUser;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  /**
   * A fresh id for this token, which becomes its `jti` claim.
   */
  readonly tokenId: string;

  /**
   * The scopes the sign-in was granted, which an access token carries.
   *
   * A sign-in through the API is granted the one scope that authorizes the
   * pool's own self-service operations, and one through the hosted endpoints
   * is granted what the authorize request asked its app client for.
   */
  readonly scopes?: readonly string[] | undefined;
}

function epochSeconds(instant: Date): number {
  return Math.floor(instant.getTime() / 1000);
}

/**
 * The claims a simulated id token and access token share.
 *
 * `sub` is the same on both, as it is on real Cognito, so code keying on it
 * gets the same user whichever token it read. `cognito:groups` is on both too,
 * in precedence order, and is left out entirely when the user is in no groups
 * rather than reported as an empty list.
 */
export class SimCognitoSharedTokenClaims {
  private readonly properties: SimCognitoTokenClaimsProperties;

  constructor(properties: SimCognitoTokenClaimsProperties) {
    this.properties = properties;
  }

  /**
   * The claims every token from this pool carries.
   */
  build(): SimCognitoTokenClaims {
    const { pool, user, issuedAt, expiresAt, tokenId } = this.properties;

    return {
      sub: user.sub,
      iss: pool.issuerUrl,
      auth_time: epochSeconds(issuedAt),
      iat: epochSeconds(issuedAt),
      exp: epochSeconds(expiresAt),
      jti: tokenId,
      ...this.groupClaim(),
    };
  }

  private groupClaim(): SimCognitoTokenClaims {
    const { pool, user } = this.properties;
    const groups = pool.groupsOf(user.username).map((group) => group.name);

    if (groups.length === 0) {
      return {};
    }

    return { "cognito:groups": groups };
  }
}
