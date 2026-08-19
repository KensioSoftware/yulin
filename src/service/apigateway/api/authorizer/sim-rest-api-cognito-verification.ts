import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { simJwtClaimStrings } from "../../../../util/jwt/sim-jwt-claim-strings.js";
import type { SimJwk } from "../../../../util/jwt/sim-jwt-keys.js";
import { SimJwtRs256 } from "../../../../util/jwt/sim-jwt-rs256.js";
import { simJwtScopes } from "../../../../util/jwt/sim-jwt-scopes.js";
import { SimJwtTimeClaims } from "../../../../util/jwt/sim-jwt-time-claims.js";
import { SimJwt } from "../../../../util/jwt/sim-jwt.js";
import type { SimRestApiMethodScopes } from "../method/sim-rest-api-method-scopes.js";
import {
  SimRestApiAdmitted,
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "./sim-rest-api-authorization.js";
import type { SimRestApiCognitoAuthorizer } from "./sim-rest-api-cognito-authorizer.js";
import type {
  SimRestApiUserPool,
  SimRestApiUserPools,
} from "./sim-rest-api-user-pools.js";

interface SimRestApiCognitoVerificationProperties {
  readonly userPools: SimRestApiUserPools;
  readonly clock: SimClock;
}

/**
 * One pool of the authorizer, and the key of that pool a token names.
 */
interface SimRestApiSigningPool {
  readonly pool: SimRestApiUserPool;
  readonly key: SimJwk;
}

/**
 * Verifies one token against one `COGNITO_USER_POOLS` authorizer.
 *
 * The checks are the ones a JWT verifier makes: decode the token, check its
 * algorithm, find the pool publishing the key its `kid` names, verify the
 * signature, then check the claims. Every one of them answers the same 401, so
 * a client learns that its token was not accepted and nothing about which
 * check it failed.
 *
 * `token_use` is not checked, so an id token and an access token are both
 * accepted by a method asking for no scope. The method's scopes are the one
 * thing that tells the two apart, since only an access token carries a `scope`
 * claim, and they are checked here because they are checked against the token.
 */
export class SimRestApiCognitoVerification {
  private readonly userPools: SimRestApiUserPools;
  private readonly times: SimJwtTimeClaims;
  private readonly rs256 = new SimJwtRs256();

  constructor(properties: SimRestApiCognitoVerificationProperties) {
    this.userPools = properties.userPools;
    this.times = new SimJwtTimeClaims({ clock: properties.clock });
  }

  /**
   * Verify a token, answering what the method should do with the request that
   * carried it.
   */
  verify(
    authorizer: SimRestApiCognitoAuthorizer,
    token: string,
    scopes: SimRestApiMethodScopes,
  ): SimRestApiAuthorization {
    const jwt = this.decode(token);

    if (jwt === undefined || !this.rs256.isSupportedAlgorithm(jwt)) {
      return SimRestApiRefused.unauthorized();
    }

    const signing = this.signingPool(authorizer, jwt);

    if (signing === undefined || !this.rs256.verify(jwt, signing.key)) {
      return SimRestApiRefused.unauthorized();
    }

    if (
      jwt.claims.text("iss") !== signing.pool.issuerUrl ||
      !this.times.hold(jwt.claims)
    ) {
      return SimRestApiRefused.unauthorized();
    }

    return this.admitted(jwt, scopes);
  }

  /**
   * The request once the token is known to be genuine, which the method's
   * scopes can still refuse.
   *
   * An unmet scope is a 403 rather than a 401: the token was accepted, and it
   * does not allow this method. It is the same refusal a policy allowing
   * nothing relevant gets, since both are a caller API Gateway identified and
   * then would not admit.
   */
  private admitted(
    jwt: SimJwt,
    scopes: SimRestApiMethodScopes,
  ): SimRestApiAuthorization {
    if (!scopes.permits(simJwtScopes(jwt.claims))) {
      return SimRestApiRefused.implicitDeny();
    }

    return new SimRestApiAdmitted({
      cognito: { claims: simJwtClaimStrings(jwt.claims) },
    });
  }

  /**
   * The pool of this authorizer that published the key the token names.
   *
   * A pool the simulation has not got publishes nothing and matches nothing,
   * which is what makes an authorizer naming a deleted pool refuse every
   * token rather than admit one it could not check.
   */
  private signingPool(
    authorizer: SimRestApiCognitoAuthorizer,
    jwt: SimJwt,
  ): SimRestApiSigningPool | undefined {
    for (const userPoolId of authorizer.providers.userPoolIds) {
      const pool = this.userPools.find(userPoolId);
      const key = pool?.keys.find(jwt.header.kid);

      if (pool !== undefined && key !== undefined) {
        return { pool, key };
      }
    }

    return undefined;
  }

  /**
   * Read the token, or answer undefined for one that is not a JWT at all.
   *
   * The refusal for an unreadable token and for one that fails verification is
   * the same, so nothing is gained by carrying the parse error further.
   */
  private decode(token: string): SimJwt | undefined {
    try {
      return SimJwt.parse(token);
    } catch {
      return undefined;
    }
  }
}
