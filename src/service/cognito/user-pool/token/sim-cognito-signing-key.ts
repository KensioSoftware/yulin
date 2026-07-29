import {
  createHash,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/* eslint-disable @typescript-eslint/consistent-type-definitions -- these are
   type aliases rather than interfaces on purpose: a JWKS has to stay
   assignable to the index-signature types verification libraries declare for
   it, and an interface is not. */

/**
 * One public key as a user pool publishes it.
 */
export type SimCognitoJwk = {
  readonly kty: "RSA";
  readonly use: "sig";
  readonly alg: "RS256";
  readonly kid: string;
  readonly n: string;
  readonly e: string;
};

/**
 * A user pool's JWKS document, in the shape the real
 * `.../.well-known/jwks.json` endpoint serves.
 */
export type SimCognitoJwks = {
  keys: SimCognitoJwk[];
};

/* eslint-enable @typescript-eslint/consistent-type-definitions */

/**
 * The RSA modulus size real Cognito signs with.
 */
const modulusLength = 2048;

/**
 * The key a simulated user pool signs its tokens with.
 *
 * The key material is real, generated with `node:crypto`, and the signature is
 * a real RS256 signature over the real signing input. A token from here
 * verifies in `aws-jwt-verify` or `jose` with nothing stubbed, which is the
 * point: a test that verifies a simulated token has exercised the verifier it
 * runs in production.
 */
export class SimCognitoSigningKey {
  /**
   * The one key pair this process signs with.
   *
   * Generating 2048-bit RSA takes long enough to notice, and a test suite
   * makes many pools, so the pair is generated once on first use and shared.
   * Every pool publishes it under the same `kid`, which is a divergence from
   * real Cognito: there, each pool has its own keys. Nothing that verifies a
   * token can tell, because a verifier reaches the right pool through the
   * `iss` claim and its own JWKS rather than through the key.
   *
   * Nothing is written to disk, and no key material is committed: a private
   * key in the repository would set off secret scanners for no gain.
   */
  static #shared: SimCognitoSigningKey | undefined;

  public readonly kid: string;

  private readonly privateKey: KeyObject;
  private readonly modulus: string;
  private readonly exponent: string;

  private constructor() {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength,
    });
    const { n, e } = publicKey.export({ format: "jwk" });

    assertDefined(n, "RSA public key modulus");
    assertDefined(e, "RSA public key exponent");

    this.privateKey = privateKey;
    this.modulus = n;
    this.exponent = e;
    this.kid = SimCognitoSigningKey.thumbprint(n, e);
  }

  /**
   * Get the key this process signs with, generating it on first use.
   */
  static shared(): SimCognitoSigningKey {
    this.#shared ??= new SimCognitoSigningKey();

    return this.#shared;
  }

  /**
   * The key id, which is the RFC 7638 thumbprint of the public key.
   *
   * Real Cognito's key ids are opaque. A thumbprint is opaque enough, and it
   * means the id names the key it actually belongs to.
   */
  private static thumbprint(modulus: string, exponent: string): string {
    return createHash("sha256")
      .update(`{"e":"${exponent}","kty":"RSA","n":"${modulus}"}`)
      .digest("base64url");
  }

  private static encode(claims: object): string {
    return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  }

  /**
   * The public half of the key, as a pool publishes it in its JWKS.
   */
  publicJwk(): SimCognitoJwk {
    return {
      kty: "RSA",
      use: "sig",
      alg: "RS256",
      kid: this.kid,
      n: this.modulus,
      e: this.exponent,
    };
  }

  /**
   * Sign claims into a JWT.
   *
   * The header names RS256 and the key id, as a real Cognito token's header
   * does, so a verifier finds the key in the pool's JWKS the same way.
   */
  sign(claims: object): string {
    const signingInput = [
      SimCognitoSigningKey.encode({ alg: "RS256", kid: this.kid }),
      SimCognitoSigningKey.encode(claims),
    ].join(".");

    const signature = createSign("RSA-SHA256")
      .update(signingInput)
      .sign(this.privateKey)
      .toString("base64url");

    return `${signingInput}.${signature}`;
  }
}
