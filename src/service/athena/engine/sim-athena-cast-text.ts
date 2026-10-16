// Both patterns below are anchored at each end with every quantifier bounded,
// so there is nothing in either to backtrack over.
// oxlint-disable security/detect-unsafe-regex

import { simAthenaInstant } from "./sim-athena-timestamp-text.js";

/** The two types a cast in the engine reads a value as. */
export type SimAthenaCastType = "date" | "timestamp";

/**
 * What Trino's cast from `varchar` to `DATE` reads, once the text is trimmed.
 *
 * A time of day is refused. `CAST('2026-08-15 10:00:00' AS DATE)` fails on
 * Athena, and only a timestamp value loses its time to a cast.
 */
const varcharDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u;

/**
 * What Trino's cast from `varchar` to `TIMESTAMP` reads.
 *
 * The time follows a space. A `T` between the date and the time fails the
 * cast on Athena, and so does a zone, which belongs to `TIMESTAMP WITH TIME
 * ZONE`.
 */
const varcharTimestamp =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?: (\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,12}))?)?)?$/u;

/**
 * The instant one value names as the cast reads it, or nothing where the cast
 * fails.
 *
 * Text is held to the formats Trino's cast from `varchar` takes. Any other
 * source is a value some column or function already typed as a date or a
 * timestamp, written as the ISO-8601 text the engine holds one as.
 */
export function simAthenaCastInstant(
  text: string,
  type: SimAthenaCastType,
  fromText: boolean,
): number | undefined {
  if (!fromText) {
    return simAthenaInstant(text);
  }

  const fields =
    type === "date"
      ? varcharDate.exec(text.trim())
      : varcharTimestamp.exec(text);

  return fields === null ? undefined : instantOf(fields);
}

/** One instant rendered as Athena renders a value of the type. */
export function simAthenaCastRendered(
  instant: number,
  type: SimAthenaCastType,
): string {
  const iso = new Date(instant).toISOString();

  return type === "date"
    ? iso.slice(0, 10)
    : iso.slice(0, 23).replace("T", " ");
}

/**
 * The instant a matched value names, where every field is in range.
 *
 * `Date.UTC` rolls the 30th of February over into March, and Trino refuses
 * it. Each field is checked against its calendar before anything is built.
 * A fraction rounds to the millisecond, which is the precision Athena gives a
 * `TIMESTAMP` with none written.
 */
function instantOf(fields: RegExpExecArray): number | undefined {
  const [year, month, day, hour, minute, second] = Array.from(
    { length: 6 },
    (_, index) => Number(fields[index + 1] ?? 0),
  ) as [number, number, number, number, number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > lastDay ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return undefined;
  }

  const milliseconds = Math.round(Number(`0.${fields[7] ?? "0"}`) * 1000);

  return Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
}
