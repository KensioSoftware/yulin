import type { SimJwtKeys } from "../../../../util/jwt/sim-jwt-keys.js";

/**
 * One user pool a `COGNITO_USER_POOLS` authorizer verifies tokens against.
 */
export interface SimRestApiUserPool {
  /** The URL this pool's tokens name as their issuer. */
  readonly issuerUrl: string;
  /** The public keys this pool publishes. */
  readonly keys: SimJwtKeys;
}

/**
 * The user pools an API Gateway can reach, as its Cognito authorizers see
 * them.
 *
 * A REST API authorizer names a pool by ARN, and all this asks for is what the
 * pool id in that ARN resolves to. That is how a Cognito authorizer reaches
 * simulated Cognito without API Gateway depending on it.
 *
 * Nothing is fetched over HTTP. A pool's published OpenID configuration names
 * the localhost origin it is served from, while its tokens name the real AWS
 * URL, so a discovery client would reject its own issuer's tokens. Resolving
 * in process compares the two strings that both come from the same getter.
 */
export interface SimRestApiUserPools {
  /**
   * The pool this id names, which is nothing when this simulation has no such
   * pool.
   */
  find(userPoolId: string): SimRestApiUserPool | undefined;
}

/**
 * The pools available to an API Gateway that has no Cognito to ask.
 *
 * Every pool id resolves to nothing, so every token fails key selection and
 * every request to a Cognito method is refused. That is the safe answer for a
 * simulated API Gateway standing on its own: a method configured to be closed
 * stays closed.
 */
export class SimRestApiNoUserPools implements SimRestApiUserPools {
  /**
   * No pool id resolves here.
   */
  find(): undefined {
    return;
  }
}
