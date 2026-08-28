/**
 * The 64-bit arithmetic both hand-written hashes are built on.
 *
 * Neither xxHash64 nor MurmurHash3 has an implementation in Node, and both are
 * defined over 64-bit words. A BigInt carries as many bits as it is given, so
 * every operation masks its answer back down to the width the algorithm works
 * in.
 */

/** Every bit of one 64-bit word. */
export const hashWord = (1n << 64n) - 1n;

/** One word rotated left, with the bits carried off the top brought back in. */
export function rotateWord(value: bigint, by: number): bigint {
  return ((value << BigInt(by)) | (value >> BigInt(64 - by))) & hashWord;
}

/** Whatever bytes are left over, read as the low end of a word. */
export function partialWord(bytes: Uint8Array): bigint {
  let value = 0n;

  for (const [index, byte] of bytes.entries()) {
    value |= BigInt(byte) << BigInt(8 * index);
  }

  return value;
}
