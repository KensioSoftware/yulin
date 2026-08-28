import { partialWord } from "./sim-athena-hash-words.js";
import {
  murmurAvalanche,
  murmurCrossed,
  murmurKeys,
  murmurRound,
  type SimAthenaMurmurHalves,
} from "./sim-athena-murmur3-mixing.js";

/** How many bytes one round of the body reads. */
const block = 16;

/**
 * The 128-bit MurmurHash3 of these bytes, seeded with zero, as Trino's
 * `murmur3` seeds it.
 *
 * This is the x64 variant, which answers differently from the x86 one of the
 * same width. Trino writes each half of the answer little-endian, which is what
 * makes `to_hex(murmur3(from_hex('69A69A69')))` read as
 * `BA5855635569B42F4920372CA0E396EF`. That is the one worked example Trino's
 * own documentation carries.
 */
export function simAthenaMurmur3(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const body = bytes.length - (bytes.length % block);
  let halves: SimAthenaMurmurHalves = [0n, 0n];

  for (let at = 0; at < body; at += block) {
    halves = murmurRound(
      halves,
      murmurKeys(view.getBigUint64(at, true), view.getBigUint64(at + 8, true)),
    );
  }

  return written(finish(halves, bytes.subarray(body), bytes.length));
}

/**
 * Whatever the body left over, then the final mix over both accumulators.
 *
 * The tail bytes are read low to high, which is the little-endian read of a
 * partial word. Neither half is rotated for them and neither is crossed with
 * the other, and a tail short enough to leave a half empty scrambles a zero
 * into it, which changes nothing.
 */
function finish(
  halves: SimAthenaMurmurHalves,
  tail: Uint8Array,
  length: number,
): SimAthenaMurmurHalves {
  const keys = murmurKeys(
    partialWord(tail.subarray(0, 8)),
    partialWord(tail.subarray(8)),
  );
  const counted = BigInt(length);
  const carried = murmurCrossed([
    halves[0] ^ keys[0] ^ counted,
    halves[1] ^ keys[1] ^ counted,
  ]);

  return murmurCrossed([
    murmurAvalanche(carried[0]),
    murmurAvalanche(carried[1]),
  ]);
}

/** Both halves as bytes, each one written little-endian, as Trino writes them. */
function written(halves: SimAthenaMurmurHalves): Uint8Array {
  const digest = new Uint8Array(block);
  const view = new DataView(digest.buffer);

  view.setBigUint64(0, halves[0], true);
  view.setBigUint64(8, halves[1], true);

  return digest;
}
