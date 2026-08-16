/* oxlint-disable no-secrets/no-secrets -- the base32 alphabet below is a
 * constant of the encoding rather than anything secret. */
import { createHmac } from "node:crypto";

/**
 * The time-based one-time password an authenticator app computes, as RFC 6238
 * defines it and as Cognito reads one: six digits from an HMAC-SHA1 of the
 * thirty-second step the shared secret is being read at.
 *
 * It is computed rather than stood in for, so the secret a pool hands out is a
 * real shared secret: code that pairs it with a QR code and a TOTP library
 * produces codes this accepts, and a code from the wrong secret is refused the
 * way a real one is.
 */

const codeDigits = 6;
const stepSeconds = 30;
const counterBytes = 8;
const secretBytes = 20;

/**
 * How far either side of the current step a code is still accepted.
 *
 * Real Cognito allows for the clock of the device that generated the code
 * being a little out. Here it is what stops a code computed a moment before
 * the request being refused for having crossed a step boundary in between.
 */
const driftSteps = 1;

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32Bits = 5;
const base32Mask = 0x1f;
const byteBits = 8;

/**
 * How many bytes a shared secret has, which is the SHA-1 block size an
 * authenticator app expects.
 */
export const simCognitoSecretBytes = secretBytes;

/**
 * Encode bytes as the base32 an authenticator app is given the secret in.
 *
 * Cognito's `SecretCode` is unpadded base32, which is what a QR code carries
 * in the `otpauth://` URL and what every authenticator library decodes.
 */
export function simCognitoBase32(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let encoded = "";

  for (const byte of bytes) {
    buffer = (buffer << byteBits) | byte;
    bits += byteBits;

    while (bits >= base32Bits) {
      bits -= base32Bits;
      encoded += base32Alphabet.charAt((buffer >>> bits) & base32Mask);
    }
  }

  if (bits > 0) {
    encoded += base32Alphabet.charAt(
      (buffer << (base32Bits - bits)) & base32Mask,
    );
  }

  return encoded;
}

/**
 * The step a moment falls in, which is what the code is computed over.
 */
function stepAt(now: Date): number {
  return Math.floor(now.getTime() / 1000 / stepSeconds);
}

/**
 * The code for one step, by the dynamic truncation RFC 4226 defines.
 */
function codeForStep(secret: Uint8Array, step: number): string {
  const counter = Buffer.alloc(counterBytes);

  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const truncated = digest.readUInt32BE(offset) & 0x7f_ff_ff_ff;

  return String(truncated % 10 ** codeDigits).padStart(codeDigits, "0");
}

/**
 * The code an authenticator app holding this secret shows at a moment.
 */
export function simCognitoTotpCode(secret: Uint8Array, now: Date): string {
  return codeForStep(secret, stepAt(now));
}

/**
 * Whether a candidate is a code this secret produces around a moment.
 *
 * A step before the epoch is skipped rather than hashed, because a counter is
 * unsigned and a simulated clock can be set to anything.
 */
export function simCognitoTotpMatches(
  secret: Uint8Array,
  candidate: string | undefined,
  now: Date,
): boolean {
  if (candidate === undefined) {
    return false;
  }

  const step = stepAt(now);

  for (let drift = -driftSteps; drift <= driftSteps; drift += 1) {
    if (step + drift >= 0 && codeForStep(secret, step + drift) === candidate) {
      return true;
    }
  }

  return false;
}
