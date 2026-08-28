import type { SQLOutputValue } from "node:sqlite";

import { SimAthenaSetUpError } from "../error/sim-athena.error.js";
import { isExplicitNull } from "./sim-athena-shim-registry.js";

/** What each encoding will read back, in either case and padded or not. */
const shapes: ReadonlyMap<string, RegExp> = new Map([
  ["hex", /^[\dA-Fa-f]*$/u],
  ["base64", /^[\d+/A-Za-z]*={0,2}$/u],
]);

/** Whether the length of this text is one the encoding could have written. */
const lengths: ReadonlyMap<string, (text: string) => boolean> = new Map([
  ["hex", (text: string) => text.length % 2 === 0],
  ["base64", isBase64Length],
]);

/** One character or none, counted in code points the way Trino counts them. */
const oneCharacter = /^.?$/u;

/** The character a UTF-8 decoder writes where the bytes were no UTF-8. */
const replacementCharacter = "\u{FFFD}";

/** The bytes that encode that character, which are valid UTF-8 themselves. */
const encodedReplacement = Buffer.from([0xef, 0xbf, 0xbd]);

/**
 * One encoded string read back to bytes, or null where it is null.
 *
 * Trino fails the query over text the encoding cannot carry, and `Buffer` reads
 * as much of it as it can and drops the rest. Raising here turns the query down
 * instead, which is nearer to Trino's answer than bytes nobody wrote.
 */
export function simAthenaDecodedText(
  text: string | undefined,
  encoding: "base64" | "hex",
): Uint8Array | null {
  if (text === undefined) {
    return null;
  }

  const read =
    shapes.get(encoding)?.test(text) === true &&
    lengths.get(encoding)?.(text) === true;

  if (!read) {
    throw new SimAthenaSetUpError(`from_${encoding} takes ${encoding} text`);
  }

  return new Uint8Array(Buffer.from(text, encoding));
}

/**
 * Whether base64 of this length decodes, padding and all.
 *
 * Base64 carries three bytes in every four characters, and a length one over a
 * multiple of four is a length no encoder could have written. Padding fills the
 * last four out, so text carrying any has to be a multiple of four long.
 * `Buffer` takes `A=` and `AAAA=` and answers with bytes nobody wrote.
 */
function isBase64Length(text: string): boolean {
  let padding = 0;

  while (text.charAt(text.length - padding - 1) === "=") {
    padding += 1;
  }

  const body = text.length - padding;

  return body % 4 !== 1 && (padding === 0 || text.length % 4 === 0);
}

/**
 * Bytes read back as text, with whatever was no UTF-8 replaced.
 *
 * Trino writes `U+FFFD` where a call named no replacement, which is what a
 * decoder writes anyway. A call naming one has that written instead, and the
 * replacement has to be a single character or empty, as Trino's does.
 *
 * Bytes carrying `U+FFFD` of their own leave nothing to tell the two apart
 * once the decoder has run, so a call naming a replacement over those raises
 * rather than replacing text that was never broken.
 */
export function simAthenaFromUtf8(
  bytes: Uint8Array | undefined,
  values: readonly SQLOutputValue[],
): string | null {
  if (bytes === undefined) {
    return null;
  }

  const decoded = new TextDecoder().decode(bytes);

  if (values.length < 2) {
    return decoded;
  }

  if (isExplicitNull(values, 1)) {
    return null;
  }

  const replacement = replacementFor(bytes, values);

  return decoded.replaceAll(replacementCharacter, () => replacement);
}

function replacementFor(
  bytes: Uint8Array,
  values: readonly SQLOutputValue[],
): string {
  const replacement = String(values.at(1));

  if (!oneCharacter.test(replacement)) {
    throw new SimAthenaSetUpError(
      "from_utf8 takes a replacement of one character or none",
    );
  }

  if (Buffer.from(bytes).includes(encodedReplacement)) {
    throw new SimAthenaSetUpError(
      "from_utf8 cannot tell a replacement character it decoded from one the bytes carried",
    );
  }

  return replacement;
}
