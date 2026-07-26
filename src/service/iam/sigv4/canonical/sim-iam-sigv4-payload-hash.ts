import { createHash } from "node:crypto";

import { SimIamSignatureDoesNotMatch } from "../error/sim-iam-sigv4.error.js";

export const simIamSigV4UnsignedPayload = "UNSIGNED-PAYLOAD";

const sha256HeaderName = "x-amz-content-sha256";
const sha256DigestPattern = /^[\da-f]{64}$/i;

/**
 * The SHA-256 of an empty body, which SigV4 uses when a request has no body.
 */
const emptyBodyHash =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/**
 * Work out the payload hash a signed request was signed with, and check the
 * body it arrived with is the body it claims.
 *
 * A signer states the payload hash in `x-amz-content-sha256`, and that header
 * is itself signed, so the claim cannot be altered without breaking the
 * signature. The claim still has to be checked against the bytes received:
 * without that, a signature would cover only the client's assertion about the
 * body, and the body could be replaced freely.
 *
 * `UNSIGNED-PAYLOAD` is the one declaration that deliberately leaves the body
 * uncovered, and is honoured. Any other non-digest value, including the
 * streaming markers that chunked uploads use, is refused rather than passed
 * through: accepting one would mean serving a request whose body nothing had
 * checked, which is worse than saying the simulator does not support it.
 */
export function simIamSigV4PayloadHash(
  headers: Headers,
  body: Uint8Array | undefined,
): string {
  const declared = headers.get(sha256HeaderName);

  if (declared === null || declared.length === 0) {
    return hashOfBody(body);
  }

  if (declared === simIamSigV4UnsignedPayload) {
    return declared;
  }

  if (!sha256DigestPattern.test(declared)) {
    throw new SimIamSignatureDoesNotMatch(
      `Signed ${sha256HeaderName} header declares ${declared}, which is ` +
        `neither a SHA-256 digest nor ${simIamSigV4UnsignedPayload}. ` +
        `Chunked and streaming payload signing is not simulated.`,
    );
  }

  const received = hashOfBody(body);

  if (received !== declared.toLowerCase()) {
    throw new SimIamSignatureDoesNotMatch(
      `Request body hashes to ${received}, not the ${declared} its signed ` +
        `${sha256HeaderName} header declares`,
    );
  }

  return declared;
}

function hashOfBody(body: Uint8Array | undefined): string {
  if (body === undefined || body.byteLength === 0) {
    return emptyBodyHash;
  }

  return createHash("sha256").update(body).digest("hex");
}
