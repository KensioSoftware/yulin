import {
  SimCognitoSigningKey,
  type SimCognitoJwks,
} from "./sim-cognito-signing-key.js";

/**
 * The key pair one simulated user pool signs its tokens with.
 *
 * The key belongs to the pool, as it does on real Cognito, so a token from one
 * pool does not carry a signature another pool's JWKS can verify. It is
 * generated the first time the pool signs or publishes anything rather than
 * when the pool is created, because 2048-bit generation takes long enough to
 * notice and most pools in a suite never sign a token at all.
 */
export class SimCognitoPoolKeys {
  #signingKey: SimCognitoSigningKey | undefined;

  /**
   * The key this pool signs with, generated on first use.
   */
  get signingKey(): SimCognitoSigningKey {
    this.#signingKey ??= SimCognitoSigningKey.generate();

    return this.#signingKey;
  }

  /**
   * The public keys this pool publishes, in the shape its JWKS endpoint serves.
   *
   * A verifier configured for this pool takes this document and verifies the
   * pool's tokens with nothing else needed. Real Cognito publishes two keys and
   * rotates between them, and this publishes one, so code assuming a single
   * entry passes here and is still wrong against real AWS.
   */
  jwks(): SimCognitoJwks {
    return { keys: [this.signingKey.publicJwk()] };
  }
}
