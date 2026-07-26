import { timingSafeEqual } from "node:crypto";

const hexSignaturePattern = /^[\da-f]+$/i;

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
