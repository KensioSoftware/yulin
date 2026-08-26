import { simAthenaDatePatternParts } from "./sim-athena-date-pattern-parts.js";

/** Write one date out in a pattern. */
export function simAthenaFormatDate(date: Date, pattern: string): string {
  return simAthenaDatePatternParts(pattern)
    .map((part) =>
      part.letter === undefined
        ? part.text
        : fieldText(date, part.letter, part.text.length),
    )
    .join("");
}

function fieldText(date: Date, letter: string, width: number): string {
  const value = fieldValue(date, letter);
  const text = String(value).padStart(width, "0");

  return width === 2 && text.length > 2 ? text.slice(-2) : text;
}

/**
 * What one pattern letter reads off a date.
 *
 * Held as a lookup so that a letter with no reader is a type error here rather
 * than a wrong value in a partition path.
 */
const fieldReaders = new Map<string, (date: Date) => number>([
  ["y", (date): number => date.getUTCFullYear()],
  ["M", (date): number => date.getUTCMonth() + 1],
  ["d", (date): number => date.getUTCDate()],
  ["H", (date): number => date.getUTCHours()],
  ["m", (date): number => date.getUTCMinutes()],
  ["s", (date): number => date.getUTCSeconds()],
]);

function fieldValue(date: Date, letter: string): number {
  return fieldReaders.get(letter)?.(date) ?? 0;
}
