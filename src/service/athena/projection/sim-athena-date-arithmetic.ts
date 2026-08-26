import type { SimAthenaDateUnit } from "./sim-athena-date-pattern.js";

/**
 * How one unit moves a date, in UTC.
 *
 * A lookup keyed by the unit rather than a switch, so a unit added to
 * `SimAthenaDateUnit` and left unhandled fails to compile.
 */
const unitMovers = new Map<
  SimAthenaDateUnit,
  (date: Date, amount: number) => void
>([
  [
    "YEARS",
    (date, amount): void => {
      moveMonths(date, amount * 12);
    },
  ],
  [
    "MONTHS",
    (date, amount): void => {
      moveMonths(date, amount);
    },
  ],
  [
    "WEEKS",
    (date, amount): void => {
      date.setUTCDate(date.getUTCDate() + amount * 7);
    },
  ],
  [
    "DAYS",
    (date, amount): void => {
      date.setUTCDate(date.getUTCDate() + amount);
    },
  ],
  [
    "HOURS",
    (date, amount): void => {
      date.setUTCHours(date.getUTCHours() + amount);
    },
  ],
  [
    "MINUTES",
    (date, amount): void => {
      date.setUTCMinutes(date.getUTCMinutes() + amount);
    },
  ],
  [
    "SECONDS",
    (date, amount): void => {
      date.setUTCSeconds(date.getUTCSeconds() + amount);
    },
  ],
]);

/**
 * Move a date by whole months, clamping the day rather than overflowing.
 *
 * The native setter rolls 31 January plus one month into 2 or 3 March. Java
 * clamps it to the last day of February, and Athena projects dates through
 * Java, so a table projecting month ends needs the clamp.
 */
function moveMonths(date: Date, months: number): void {
  const day = date.getUTCDate();

  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(Math.min(day, lastDayOfMonth(date)));
}

function lastDayOfMonth(date: Date): number {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

/** Move a date on by a whole number of one unit, in UTC. */
export function simAthenaAddUnits(
  date: Date,
  amount: number,
  unit: SimAthenaDateUnit,
): Date {
  const moved = new Date(date);

  unitMovers.get(unit)?.(moved, amount);

  return moved;
}
