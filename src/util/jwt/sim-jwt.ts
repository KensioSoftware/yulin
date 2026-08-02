import {
  isSimJwtClaimList,
  type SimJwtClaimRecord,
  SimJwtClaims,
  type SimJwtClaimValue,
} from "./sim-jwt-claims.js";
import { SimJwtError } from "./sim-jwt.error.js";

/**
 * How many dot-separated parts a signed JWT has.
 *
 * A JWE has five, and an unsecured JWT has three with an empty signature.
 * Neither is a token anything here accepts, so both are refused by this count
 * or by the empty-part check beside it.
 */
const signedJwtParts = 3;

interface SimJwtProperties {
  readonly header: SimJwtHeader;
  readonly claims: SimJwtClaims;
  readonly signingInput: string;
  readonly signature: Buffer;
}

/**
 * The header of a JWT: which algorithm signed it, and with which key.
 *
 * `kid` is optional in the JWT specification and present on every token from
 * an issuer publishing more than one key, so it is read when it is there and
 * left undefined when it is not.
 */
export interface SimJwtHeader {
  readonly alg: string;
  readonly kid?: string | undefined;
}

/**
 * One parsed JWT: its header, its claims, and the bytes a verifier needs.
 *
 * Parsing says nothing about whether the token is genuine. It says only that
 * the string is shaped like a JWT and that its header and payload are JSON
 * objects, which is what has to be true before a signature can be checked at
 * all.
 */
export class SimJwt {
  public readonly header: SimJwtHeader;
  public readonly claims: SimJwtClaims;

  /**
   * The signed bytes: the encoded header and payload joined by a dot, exactly
   * as they arrived. Re-encoding them would change the signing input, since
   * two encodings of the same JSON are different strings.
   */
  public readonly signingInput: string;

  public readonly signature: Buffer;

  private constructor(properties: SimJwtProperties) {
    this.header = properties.header;
    this.claims = properties.claims;
    this.signingInput = properties.signingInput;
    this.signature = properties.signature;
  }

  /**
   * Read a token string as a JWT, or refuse it.
   */
  static parse(token: string): SimJwt {
    const parts = token.split(".");

    if (parts.length !== signedJwtParts) {
      throw new SimJwtError(
        `A JWT has ${String(signedJwtParts)} dot-separated parts, and this ` +
          `token has ${String(parts.length)}`,
      );
    }

    const [encodedHeader = "", encodedPayload = "", encodedSignature = ""] =
      parts;

    if (
      encodedHeader.length === 0 ||
      encodedPayload.length === 0 ||
      encodedSignature.length === 0
    ) {
      throw new SimJwtError("A JWT has no empty parts");
    }

    return new SimJwt({
      header: this.readHeader(encodedHeader),
      claims: new SimJwtClaims(this.readObject(encodedPayload, "payload")),
      signingInput: `${encodedHeader}.${encodedPayload}`,
      signature: Buffer.from(encodedSignature, "base64url"),
    });
  }

  private static readHeader(encoded: string): SimJwtHeader {
    const values = this.readObject(encoded, "header");
    const alg = values["alg"];

    if (typeof alg !== "string") {
      throw new SimJwtError("A JWT header names its algorithm in alg");
    }

    const kid = values["kid"];

    if (kid !== undefined && typeof kid !== "string") {
      throw new SimJwtError("A JWT header kid is the name of one key");
    }

    return { alg, ...(kid !== undefined && { kid }) };
  }

  /**
   * Decode one base64url part into the JSON object it has to hold.
   */
  private static readObject(encoded: string, part: string): SimJwtClaimRecord {
    const decoded = this.readJson(encoded, part);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      isSimJwtClaimList(decoded)
    ) {
      throw new SimJwtError(`A JWT ${part} is a JSON object`);
    }

    return decoded;
  }

  private static readJson(encoded: string, part: string): SimJwtClaimValue {
    const text = Buffer.from(encoded, "base64url").toString("utf8");

    try {
      // The decoded text is JSON from a token nothing has verified yet, so its
      // type is asserted rather than known. Everything that reads it goes
      // through SimJwtClaims, which checks the type of each claim it answers.
      return JSON.parse(text) as SimJwtClaimValue;
    } catch {
      throw new SimJwtError(`A JWT ${part} is base64url-encoded JSON`);
    }
  }
}
