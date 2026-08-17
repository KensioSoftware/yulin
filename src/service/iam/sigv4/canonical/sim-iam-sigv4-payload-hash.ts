import { createHash } from "node:crypto";

import { SimIamSignatureDoesNotMatch } from "../error/sim-iam-sigv4.error.js";
import {
  simIamSigV4PresignedParameter,
  simIamSigV4PresignedParameters,
} from "../presign/sim-iam-sigv4-presigned-parameters.js";

export const simIamSigV4UnsignedPayload = "UNSIGNED-PAYLOAD";

/**
 * The header a signed request declares its payload hash in.
 *
 * Whoever builds a signed request states the hash here, and whoever receives
 * one reads it from here, so the name is shared rather than written out again
 * at each end.
 */
export const simIamSigV4ContentSha256Header = "x-amz-content-sha256";

const sha256DigestPattern = /^[\da-f]{64}$/i;

/**
 * The SHA-256 of an empty body, which SigV4 uses when a request has no body.
 */
const emptyBodyHash =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/**
 * What a signed request declares its body hashes to.
 *
 * A header-signed request states this in `x-amz-content-sha256`. A presigned
 * URL states it in the query parameter of the same name, and a presigned URL
 * that states nothing has an unsigned payload, because a URL is signed before
 * there is a body to hash. Reading the declaration is the one part of building
 * a canonical request that differs between the two.
 */
export class SimIamSigV4PayloadDeclaration {
  private readonly declared: string | null;

  private constructor(declared: string | null) {
    this.declared = declared;
  }

  /**
   * The declaration a header-signed request makes.
   */
  static fromHeaders(headers: Headers): SimIamSigV4PayloadDeclaration {
    return new SimIamSigV4PayloadDeclaration(
      headers.get(simIamSigV4ContentSha256Header),
    );
  }

  /**
   * The declaration a presigned URL makes, defaulting to an unsigned payload.
   */
  static fromPresignedQuery(url: URL): SimIamSigV4PayloadDeclaration {
    return new SimIamSigV4PayloadDeclaration(
      simIamSigV4PresignedParameter(
        url,
        simIamSigV4PresignedParameters.contentSha256,
      ) ?? simIamSigV4UnsignedPayload,
    );
  }

  /**
   * Work out the payload hash the request was signed with, and check that the
   * body it arrived with is the body it claims.
   *
   * The declaration is itself signed, so the claim cannot be altered without
   * breaking the signature. The claim still has to be checked against the bytes
   * received: without that, a signature would cover only the client's assertion
   * about the body, and the body could be replaced freely.
   *
   * `UNSIGNED-PAYLOAD` is the one declaration that deliberately leaves the body
   * uncovered, and is honoured. Any other non-digest value, including the
   * streaming markers that chunked uploads use, is refused rather than passed
   * through: accepting one would mean serving a request whose body nothing had
   * checked, which is worse than saying the simulator does not support it.
   */
  hashFor(body: Uint8Array | undefined): string {
    const declared = this.declared;

    if (declared === null || declared.length === 0) {
      return hashOfBody(body);
    }

    if (declared === simIamSigV4UnsignedPayload) {
      return declared;
    }

    if (!sha256DigestPattern.test(declared)) {
      throw new SimIamSignatureDoesNotMatch(
        `Signed ${simIamSigV4ContentSha256Header} declares ${declared}, ` +
          `which is neither a SHA-256 digest nor ` +
          `${simIamSigV4UnsignedPayload}. Chunked and streaming payload ` +
          `signing is not simulated.`,
      );
    }

    const received = hashOfBody(body);

    if (received !== declared.toLowerCase()) {
      throw new SimIamSignatureDoesNotMatch(
        `Request body hashes to ${received}, not the ${declared} its signed ` +
          `${simIamSigV4ContentSha256Header} declares`,
      );
    }

    return declared;
  }
}

function hashOfBody(body: Uint8Array | undefined): string {
  if (body === undefined || body.byteLength === 0) {
    return emptyBodyHash;
  }

  return createHash("sha256").update(body).digest("hex");
}
