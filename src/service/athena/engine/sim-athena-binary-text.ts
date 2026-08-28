import type { SQLOutputValue } from "node:sqlite";

import { SimAthenaSetUpError } from "../error/sim-athena.error.js";
import { isExplicitNull } from "./sim-athena-shim-registry.js";

/** What each encoding will read back, in either case and padded or not. */
const shapes: ReadonlyMap<string, RegExp> = new Map([
  ["hex", /^[\dA-Fa-f]*$/u],
  ["base64", /^[\d+/A-Za-z]*={0,2}$/u],
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

  const even = encoding === "base64" || text.length % 2 === 0;

  if (!even || shapes.get(encoding)?.test(text) !== true) {
    throw new SimAthenaSetUpError(`from_${encoding} takes ${encoding} text`);
  }

  return new Uint8Array(Buffer.from(text, encoding));
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
