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
      date.setUTCFullYear(date.getUTCFullYear() + amount);
    },
  ],
  [
    "MONTHS",
    (date, amount): void => {
      date.setUTCMonth(date.getUTCMonth() + amount);
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
