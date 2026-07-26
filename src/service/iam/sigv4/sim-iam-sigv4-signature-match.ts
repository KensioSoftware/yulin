import { timingSafeEqual } from "node:crypto";

/**
 * A SigV4 signature is a SHA-256 digest, so it is always exactly 64 hex
 * characters. Requiring that here means nothing shorter, longer or oddly sized
 * reaches the decoder, rather than relying on how it handles such input.
 */
const hexSignaturePattern = /^[\da-f]{64}$/i;

/**
 * Compare a calculated signature with the one a request presented.
 *
 * The comparison is over the decoded bytes and takes the same time whatever
 * they are, so nothing about the expected signature can be learned by measuring
 * how quickly a wrong one is rejected.
 */
export function simIamSigV4SignaturesMatch(
  expected: string,
  presented: string,
): boolean {
  if (!hexSignaturePattern.test(presented)) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, "hex");
  const presentedBytes = Buffer.from(presented, "hex");

  if (expectedBytes.length !== presentedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, presentedBytes);
}
