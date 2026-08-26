import { simAthenaDateParts } from "./sim-athena-timestamp-text.js";

/** How long each unit a clock counts runs, in milliseconds. */
const clockUnits: ReadonlyMap<string, number> = new Map([
  ["millisecond", 1],
  ["second", 1000],
  ["minute", 60_000],
  ["hour", 3_600_000],
  ["day", 86_400_000],
  ["week", 604_800_000],
]);

/** How many months each unit a calendar counts runs. */
const calendarUnits: ReadonlyMap<string, number> = new Map([
  ["month", 1],
  ["quarter", 3],
  ["year", 12],
]);

/**
 * Whether this is a unit either kind of arithmetic knows.
 *
 * A shim answering a unit it does not know would be answering wrongly, so the
 * ones here are the whole of what `date_add` and `date_diff` take. Anything
 * else raises, and the engine turns the query down.
 */
export function isDateUnit(unit: string): boolean {
  return clockUnits.has(unit) || calendarUnits.has(unit);
}

/**
 * One instant moved by a whole number of units.
 *
 * A calendar unit lands on the same day of the month where the month has one,
 * and on the last day of the month where it has not. Adding a month to the
 * thirty-first of January gives the last day of February, which is what Trino
 * does and what overflowing into March would not.
 */
export function simAthenaDateAdded(
  unit: string,
  value: number,
  instant: number,
): number {
  const milliseconds = clockUnits.get(unit);

  if (milliseconds !== undefined) {
    return instant + value * milliseconds;
  }

  const months = calendarMonths(unit) * value;
  const parts = simAthenaDateParts(instant);
  const moved = parts.month + months;
  const year = parts.year + Math.floor(moved / 12);
  const month = ((moved % 12) + 12) % 12;

  return (
    Date.UTC(year, month, Math.min(parts.day, lastDayOf(year, month))) +
    parts.time
  );
}

/**
 * How many whole units lie between two instants.
 *
 * A part of a unit does not count, whichever direction the pair runs in, which
 * is the truncation Trino applies.
 *
 * A calendar unit is counted by moving the first instant and seeing whether it
 * reached the second, which is how `java.time` counts and therefore how Trino
 * does. It is the clamping that makes the difference. The thirty-first of
 * January to the twenty-eighth of February is a whole month, because adding one
 * month to the first lands exactly on the second.
 */
export function simAthenaDateDifference(
  unit: string,
  from: number,
  to: number,
): number {
  const milliseconds = clockUnits.get(unit);

  if (milliseconds !== undefined) {
    return Math.trunc((to - from) / milliseconds);
  }

  return Math.trunc(reachedMonths(from, to) / calendarMonths(unit));
}

/**
 * How many months of moving the first instant the second is worth.
 *
 * The calendar fields give the count to within one, and moving by that count
 * says whether it overshot.
 */
function reachedMonths(from: number, to: number): number {
  const start = simAthenaDateParts(from);
  const end = simAthenaDateParts(to);
  const months = (end.year - start.year) * 12 + (end.month - start.month);

  if (months > 0 && simAthenaDateAdded("month", months, from) > to) {
    return months - 1;
  }

  if (months < 0 && simAthenaDateAdded("month", months, from) < to) {
    return months + 1;
  }

  return months;
}

/**
 * How many months one calendar unit runs.
 *
 * Every caller has been past `isDateUnit`, so a unit that is neither a clock
 * unit nor a calendar one never reaches here.
 */
function calendarMonths(unit: string): number {
  return calendarUnits.get(unit) ?? 1;
}

function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
