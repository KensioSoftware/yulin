import { simAthenaAddUnits } from "./sim-athena-date-arithmetic.js";
import { simAthenaFormatDate } from "./sim-athena-date-format.js";
import {
  simAthenaDateUnit,
  simAthenaPatternUnit,
} from "./sim-athena-date-pattern.js";
import { simAthenaDateBound } from "./sim-athena-projection-bound.js";
import type { SimAthenaProjectionColumn } from "./sim-athena-projection-column.js";
import { SimAthenaProjectionError } from "./sim-athena-projection-error.js";
import {
  simAthenaProjectionBounds,
  simAthenaGuardProjectionSize,
} from "./sim-athena-projection-range.js";

/**
 * The values a `date` column takes, walked from one bound to the other.
 */
export function simAthenaDateValues(
  column: SimAthenaProjectionColumn,
  now: Date,
): readonly string[] {
  const pattern = column.format;

  if (pattern === undefined) {
    throw new SimAthenaProjectionError(
      `Partition column ${column.name} is projected as a date and has no ` +
        `projection.${column.name}.format`,
    );
  }

  const [from, to] = simAthenaProjectionBounds(column);
  const unit =
    simAthenaDateUnit(column.intervalUnit) ?? simAthenaPatternUnit(pattern);

  if (unit === undefined) {
    throw new SimAthenaProjectionError(
      `Partition column ${column.name} has date format ${pattern}, which ` +
        `carries no field to step through`,
    );
  }

  const end = simAthenaDateBound(column.name, to, pattern, now);
  const step = column.interval ?? 1;
  const values: string[] = [];
  let cursor = simAthenaDateBound(column.name, from, pattern, now);

  while (cursor.getTime() <= end.getTime()) {
    values.push(simAthenaFormatDate(cursor, pattern));
    simAthenaGuardProjectionSize(column, values.length);
    cursor = simAthenaAddUnits(cursor, step, unit);
  }

  return values;
}
