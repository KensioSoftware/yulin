import { createPublicKey, createVerify, type KeyObject } from "node:crypto";

import type { SimJwk } from "./sim-jwt-keys.js";
import type { SimJwt } from "./sim-jwt.js";

/**
 * The one signature algorithm simulated, which is the one Cognito signs with.
 *
 * The allow-list is a single value on purpose. `none` and the `HS*` family are
 * the two ways a verifier that trusts the header is talked out of checking
 * anything, and neither is a value any issuer here uses.
 */
export const simJwtRs256Algorithm = "RS256";

/**
 * Verifies the RS256 signature of a JWT against a published JWK.
 *
 * The signature check is real: the public key is reconstructed from the JWK's
 * modulus and exponent, and `node:crypto` verifies the real signature over the
 * real signing input. Nothing here trusts the token's own header beyond
 * reading which key it names.
 */
export class SimJwtRs256 {
  /**
   * Whether this token's header names the one algorithm that is verified.
   */
  isSupportedAlgorithm(jwt: SimJwt): boolean {
    return jwt.header.alg === simJwtRs256Algorithm;
  }

  /**
   * Whether this token carries a genuine RS256 signature by this key.
   */
  verify(jwt: SimJwt, jwk: SimJwk): boolean {
    const publicKey = this.publicKey(jwk);

    if (publicKey === undefined) {
      return false;
    }

    return createVerify("RSA-SHA256")
      .update(jwt.signingInput)
      .verify(publicKey, jwt.signature);
  }

  /**
   * Reconstruct the public key from the published JWK.
   *
   * A JWK that cannot be read is treated as a key that verifies nothing,
   * rather than as an error: it comes from an issuer document, so refusing the
   * token is the right answer and there is nothing for a caller to do about
   * the key itself.
   */
  private publicKey(jwk: SimJwk): KeyObject | undefined {
    try {
      // Only the key type and the RSA parameters take part in the
      // reconstruction. `kid`, `alg` and `use` describe how the key is meant
      // to be chosen and used, not what it is.
      return createPublicKey({
        key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
        format: "jwk",
      });
    } catch {
      return undefined;
    }
  }
}
