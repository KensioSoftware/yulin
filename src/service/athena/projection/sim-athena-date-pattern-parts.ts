import type { SimAthenaDatePatternPart } from "./sim-athena-date-pattern.js";

/** Characters a date field is written with. */
const patternLetters = new Set(["y", "M", "d", "H", "m", "s"]);

/**
 * Split a Java date pattern into runs of one letter and runs of literal text.
 *
 * Athena writes a projected date's format the way Java's `SimpleDateFormat`
 * writes one, and `yyyy/MM/dd` is the shape nearly every table uses. Only the
 * six letters that appear in a partition path are understood.
 *
 * Text in single quotes is literal, as Java has it, and `''` inside it is one
 * quote. Without that a separator such as `'day='` would have its `d` read as
 * a day field.
 */
export function simAthenaDatePatternParts(
  pattern: string,
): readonly SimAthenaDatePatternPart[] {
  const parts: SimAthenaDatePatternPart[] = [];
  let cursor = 0;

  while (cursor < pattern.length) {
    const character = pattern.charAt(cursor);

    if (character === "'") {
      const quoted = readQuoted(pattern, cursor);

      parts.push({ letter: undefined, text: quoted.text });
      cursor = quoted.next;
      continue;
    }

    const letter = patternLetters.has(character) ? character : undefined;
    let end = cursor + 1;

    while (end < pattern.length && sameRun(pattern, character, end, letter)) {
      end += 1;
    }

    parts.push({ letter, text: pattern.slice(cursor, end) });
    cursor = end;
  }

  return parts;
}

/**
 * Read a run of quoted literal text, starting at its opening quote.
 *
 * `''` is one quote, and a run that never closes takes the rest of the
 * pattern.
 */
function readQuoted(
  pattern: string,
  start: number,
): { text: string; next: number } {
  // `''` on its own is one literal quote, which is how Java escapes it.
  if (pattern.charAt(start + 1) === "'") {
    return { text: "'", next: start + 2 };
  }

  let cursor = start + 1;
  let text = "";

  while (cursor < pattern.length) {
    if (pattern.charAt(cursor) !== "'") {
      text += pattern.charAt(cursor);
      cursor += 1;
      continue;
    }

    if (pattern.charAt(cursor + 1) === "'") {
      text += "'";
      cursor += 2;
      continue;
    }

    return { text, next: cursor + 1 };
  }

  return { text, next: cursor };
}

function sameRun(
  pattern: string,
  character: string,
  index: number,
  letter: string | undefined,
): boolean {
  const next = pattern.charAt(index);

  if (letter !== undefined) {
    return next === character;
  }

  return !patternLetters.has(next) && next !== "'";
}
