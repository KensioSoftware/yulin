import {
  hashWord as word,
  rotateWord as rotate,
} from "./sim-athena-hash-words.js";

/** The two accumulators MurmurHash3 carries, the low half first. */
export type SimAthenaMurmurHalves = readonly [bigint, bigint];

const constant1 = 0x87_c3_7b_91_11_42_53_d5n;
const constant2 = 0x4c_f5_ad_43_27_45_93_7fn;

/** Two words scrambled into the keys one round mixes in. */
export function murmurKeys(low: bigint, high: bigint): SimAthenaMurmurHalves {
  return [
    scramble(low, constant1, 31, constant2),
    scramble(high, constant2, 33, constant1),
  ];
}

/**
 * Both accumulators taken through one round, the low half leading.
 *
 * The high half is crossed with the low half the round has just written, which
 * is what carries a block into every later one.
 */
export function murmurRound(
  halves: SimAthenaMurmurHalves,
  keys: SimAthenaMurmurHalves,
): SimAthenaMurmurHalves {
  const low = mixed(halves[0] ^ keys[0], halves[1], 27, 0x52_dc_e7_29n);

  return [low, mixed(halves[1] ^ keys[1], low, 31, 0x38_49_5a_b5n)];
}

/** Each accumulator with the other added into it, the low half first. */
export function murmurCrossed(
  halves: SimAthenaMurmurHalves,
): SimAthenaMurmurHalves {
  const low = (halves[0] + halves[1]) & word;

  return [low, (halves[1] + low) & word];
}

/** The final mix, which spreads every bit of one half over its word. */
export function murmurAvalanche(value: bigint): bigint {
  let spread = ((value ^ (value >> 33n)) * 0xff_51_af_d7_ed_55_8c_cdn) & word;

  spread = ((spread ^ (spread >> 33n)) * 0xc4_ce_b9_fe_1a_85_ec_53n) & word;

  return spread ^ (spread >> 33n);
}

function scramble(
  value: bigint,
  before: bigint,
  by: number,
  after: bigint,
): bigint {
  return (rotate((value * before) & word, by) * after) & word;
}

function mixed(half: bigint, other: bigint, by: number, added: bigint): bigint {
  return ((rotate(half, by) + other) * 5n + added) & word;
}
