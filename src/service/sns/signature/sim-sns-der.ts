/**
 * The little bit of DER writing a self-signed certificate needs.
 *
 * Node's `crypto` reads an X.509 certificate but does not write one, and the
 * signature a simulated SNS message carries is only useful if a verifier can
 * check it against a certificate. So the certificate is assembled by hand, and
 * this is the encoding it is assembled with: every ASN.1 value is a tag, a
 * length and a body, and that is the whole of what is here.
 *
 * The tags are exported alongside it because the shapes X.509 uses are the
 * caller's business rather than this module's. It is not a general ASN.1
 * encoder and does not try to be one.
 */

export const derSequenceTag = 0x30;

export const derSetTag = 0x31;

export const derIntegerTag = 0x02;

export const derBitStringTag = 0x03;

export const derNullTag = 0x05;

export const derObjectIdentifierTag = 0x06;

export const derPrintableStringTag = 0x13;

export const derUtcTimeTag = 0x17;

/**
 * The tag of an explicitly tagged context specific zero, which is how a
 * certificate carries its version.
 */
export const derExplicitZeroTag = 0xa0;

/**
 * The largest length DER writes in the length byte itself.
 */
const shortFormLimit = 0x80;

/**
 * Encode a length in DER's short or long form.
 */
function derLength(length: number): Buffer {
  if (length < shortFormLimit) {
    return Buffer.from([length]);
  }

  const bytes: number[] = [];

  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest % 256);
  }

  return Buffer.from([shortFormLimit | bytes.length, ...bytes]);
}

/**
 * One ASN.1 value: a tag, the length of what follows, and what follows.
 */
export function derValue(tag: number, ...contents: Buffer[]): Buffer {
  const body = Buffer.concat(contents);

  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

/**
 * A DER value holding ASCII text, which is what a common name and a UTCTime
 * both are.
 */
export function derText(tag: number, value: string): Buffer {
  return derValue(tag, Buffer.from(value, "ascii"));
}

/**
 * A DER value holding bytes given one at a time.
 */
export function derBytes(tag: number, ...bytes: number[]): Buffer {
  return derValue(tag, Buffer.from(bytes));
}
