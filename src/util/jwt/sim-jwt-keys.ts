/**
 * One public key as an issuer publishes it in its JWKS.
 *
 * The fields are the ones an RSA signing key carries. They are typed as plain
 * strings rather than as literals so that a JWKS from any simulated issuer is
 * assignable here without being converted first.
 */
export interface SimJwk {
  readonly kty: string;
  readonly kid: string;
  readonly n: string;
  readonly e: string;
  readonly alg?: string | undefined;
  readonly use?: string | undefined;
}

/**
 * The keys one issuer publishes, selected by the `kid` a token names.
 *
 * A verifier picks the key by id rather than trying each one, which is what
 * makes an unknown `kid` a refusal rather than a slow failure. An issuer that
 * publishes no keys at all therefore matches nothing, which is the answer for
 * an issuer this simulation knows nothing about.
 */
export class SimJwtKeys {
  private readonly keys: readonly SimJwk[];

  constructor(keys: readonly SimJwk[]) {
    this.keys = keys;
  }

  /**
   * The key with this id, if the issuer published one.
   */
  find(kid: string | undefined): SimJwk | undefined {
    if (kid === undefined) {
      return undefined;
    }

    return this.keys.find((key) => key.kid === kid);
  }
}
