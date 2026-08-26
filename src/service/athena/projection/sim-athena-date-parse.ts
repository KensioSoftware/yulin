import { simAthenaDatePatternParts } from "./sim-athena-date-pattern.js";
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

    const digits = text.slice(cursor, cursor + part.text.length);

    if (!/^\d+$/.test(digits) || digits.length !== part.text.length) {
      return undefined;
    }

    fields[part.letter] = Number(digits);
    cursor += digits.length;
  }

  if (cursor !== text.length) {
    return undefined;
  }

  const date = dateOfFields(fields);

  return simAthenaFormatDate(date, pattern) === text ? date : undefined;
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
