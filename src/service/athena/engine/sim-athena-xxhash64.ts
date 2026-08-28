import {
  hashWord as word,
  rotateWord as rotate,
} from "./sim-athena-hash-words.js";

const prime1 = 11_400_714_785_074_694_791n;
const prime2 = 14_029_467_366_897_019_727n;
const prime3 = 1_609_587_929_392_839_161n;
const prime4 = 9_650_029_242_287_828_579n;
const prime5 = 2_870_177_450_012_600_261n;

/** How many bytes one round of the four-lane body reads. */
const stripe = 32;

/**
 * The xxHash64 of these bytes, seeded with zero, as Trino's `xxhash64` seeds
 * it.
 *
 * Trino answers with the eight bytes of the hash written big-endian, which is
 * what makes `to_hex(xxhash64(to_utf8('hello')))` read as `26C7827D889F6DA3`.
 */
export function simAthenaXxHash64(bytes: Uint8Array): Uint8Array {
  const digest = new Uint8Array(8);

  new DataView(digest.buffer).setBigUint64(0, hashOf(bytes), false);

  return digest;
}

function hashOf(bytes: Uint8Array): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const body = bytes.length - (bytes.length % stripe);
  let hash = bytes.length < stripe ? prime5 : mixedLanes(view, body);

  hash = (hash + BigInt(bytes.length)) & word;

  return avalanche(tail(view, bytes, hash, body));
}

/**
 * The four lanes the body is read into, mixed back down to one word.
 *
 * Each lane takes every fourth eight bytes, which is what lets the real
 * implementation read four of them at once.
 */
function mixedLanes(view: DataView, body: number): bigint {
  let lanes = [
    { value: (prime1 + prime2) & word, rotation: 1 },
    { value: prime2, rotation: 7 },
    { value: 0n, rotation: 12 },
    { value: -prime1 & word, rotation: 18 },
  ];

  for (let at = 0; at < body; at += stripe) {
    lanes = lanes.map((lane, index) => ({
      ...lane,
      value: round(lane.value, view.getBigUint64(at + index * 8, true)),
    }));
  }

  let hash = lanes.reduce(
    (sum, lane) => (sum + rotate(lane.value, lane.rotation)) & word,
    0n,
  );

  for (const lane of lanes) {
    hash = ((hash ^ round(0n, lane.value)) * prime1 + prime4) & word;
  }

  return hash;
}

/**
 * Whatever the body left over, read eight bytes at a time, then four, then one.
 */
function tail(
  view: DataView,
  bytes: Uint8Array,
  hash: bigint,
  body: number,
): bigint {
  let mixed = hash;
  let at = body;

  for (; at + 8 <= bytes.length; at += 8) {
    const lane = round(0n, view.getBigUint64(at, true));

    mixed = (rotate(mixed ^ lane, 27) * prime1 + prime4) & word;
  }

  if (at + 4 <= bytes.length) {
    const lane = (BigInt(view.getUint32(at, true)) * prime1) & word;

    mixed = (rotate(mixed ^ lane, 23) * prime2 + prime3) & word;
    at += 4;
  }

  for (; at < bytes.length; at += 1) {
    const lane = (BigInt(view.getUint8(at)) * prime5) & word;

    mixed = (rotate(mixed ^ lane, 11) * prime1) & word;
  }

  return mixed;
}

/** The final mix, which spreads every bit of the accumulator over the word. */
function avalanche(hash: bigint): bigint {
  let mixed = ((hash ^ (hash >> 33n)) * prime2) & word;

  mixed = ((mixed ^ (mixed >> 29n)) * prime3) & word;

  return mixed ^ (mixed >> 32n);
}

function round(lane: bigint, input: bigint): bigint {
  return (rotate((lane + input * prime2) & word, 31) * prime1) & word;
}
