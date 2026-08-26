import { simAthenaDatePatternParts } from "./sim-athena-date-pattern-parts.js";
import { simAthenaFormatDate } from "./sim-athena-date-format.js";

/**
 * Read a date written in one pattern, or nothing where it does not fit.
 *
 * Fields the pattern leaves out take their lowest value, which is what makes
 * `2026` under `yyyy` the first instant of that year.
 *
 * The date is written back out and compared against the text it came from.
 * `Date.UTC` rolls a thirteenth month into the next January rather than
 * refusing it, and the round trip is what catches that.
 */
export function simAthenaParseDate(
  text: string,
  pattern: string,
): Date | undefined {
  const fields: Record<string, number> = {};
  let cursor = 0;

  for (const part of simAthenaDatePatternParts(pattern)) {
    if (part.letter === undefined) {
      if (!text.startsWith(part.text, cursor)) {
        return undefined;
      }

      cursor += part.text.length;
      continue;
    }

    const digits = numberAt(text, cursor, part.text.length);

    if (digits === undefined) {
      return undefined;
    }

    fields[part.letter] = yearValue(part.letter, part.text.length, digits);
    cursor += digits.length;
  }

  if (cursor !== text.length) {
    return undefined;
  }

  const date = dateOfFields(fields);

  return simAthenaFormatDate(date, pattern) === text ? date : undefined;
}

/**
 * The digits one field takes, or nothing where they are absent.
 *
 * A pattern letter written once takes as many digits as are there, the way
 * Java reads one. `yyyy-M-d` writes October the fifth as `2026-10-5`, and a
 * reader taking one digit for `M` would stop in the middle of the month.
 */
function numberAt(
  text: string,
  start: number,
  width: number,
): string | undefined {
  if (width > 1) {
    const fixed = text.slice(start, start + width);

    return /^\d+$/.test(fixed) && fixed.length === width ? fixed : undefined;
  }

  let end = start;

  while (
    end < text.length &&
    text.charAt(end) >= "0" &&
    text.charAt(end) <= "9"
  ) {
    end += 1;
  }

  return end === start ? undefined : text.slice(start, end);
}

/**
 * What a year field's digits come to.
 *
 * A two-letter year is the 2000s here. Java slides an eighty year window
 * around the current date, and pinning it to one century keeps a projected
 * range from starting in 1926 because a table wrote `26`.
 */
function yearValue(letter: string, width: number, digits: string): number {
  const value = Number(digits);

  return letter === "y" && width === 2 ? 2000 + value : value;
}

function dateOfFields(fields: Readonly<Record<string, number>>): Date {
  return new Date(
    Date.UTC(
      fields["y"] ?? 1970,
      (fields["M"] ?? 1) - 1,
      fields["d"] ?? 1,
      fields["H"] ?? 0,
      fields["m"] ?? 0,
      fields["s"] ?? 0,
    ),
  );
}
