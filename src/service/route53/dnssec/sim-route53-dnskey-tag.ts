/**
 * The key tag of a DNSKEY, by the RFC 4034 Appendix B algorithm.
 *
 * The RDATA is summed as a sequence of 16-bit words, the carry is folded back
 * in, and what is left of the low 16 bits is the tag. It is not a hash and it
 * is not unique; it is the hint a resolver uses to pick which key to try, and
 * it is what a DS record leads with.
 */
export function simRoute53DnskeyKeyTag(rdata: Uint8Array): number {
  let accumulator = 0;

  for (const [index, byte] of rdata.entries()) {
    accumulator += shiftedByte(index, byte);
  }

  accumulator += (accumulator >> 16) & 0xff_ff;

  return accumulator & 0xff_ff;
}

/**
 * A byte's contribution to the sum: the high half of a word, or the low half.
 */
function shiftedByte(index: number, byte: number): number {
  if (index % 2 === 0) {
    return byte << 8;
  }

  return byte;
}
