import { randomInt } from "node:crypto";

/**
 * How many digits an MFA code has, which is what a confirmation code has too.
 */
const codeDigits = 6;

/**
 * How many characters of a destination Cognito leaves readable.
 */
const readableCharacters = 4;

/**
 * The mask Cognito puts in front of them.
 */
const maskLength = 7;

/**
 * Issue the code a pool texts a user it is challenging.
 *
 * Leading zeros are kept, because a real code has them and a test treating the
 * value as a number would lose them.
 */
export function simCognitoMfaCode(): string {
  return String(randomInt(0, 10 ** codeDigits)).padStart(codeDigits, "0");
}

/**
 * A destination as `CODE_DELIVERY_DESTINATION` reports it.
 *
 * Cognito never tells a caller the whole phone number it sent a code to: the
 * challenge carries the last few characters behind a fixed run of asterisks,
 * which is enough for an application to say which number it went to and not
 * enough to learn one. The mask is a fixed length there rather than the length
 * of what it hides, so a number's length cannot be read off it either.
 */
export function simCognitoMaskedDestination(destination: string): string {
  return `+${"*".repeat(maskLength)}${destination.slice(-readableCharacters)}`;
}
