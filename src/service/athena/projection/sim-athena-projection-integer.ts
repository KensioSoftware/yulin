import type { SimAthenaProjectionColumn } from "./sim-athena-projection-column.js";
import { SimAthenaProjectionError } from "./sim-athena-projection-error.js";
import {
  simAthenaProjectionBounds,
  simAthenaGuardProjectionSize,
} from "./sim-athena-projection-range.js";

/**
 * The values an `integer` column takes.
 *
 * `NOW` belongs to a date range, and an integer range carrying one is a
 * configuration written against the wrong type.
 */
export function simAthenaIntegerValues(
  column: SimAthenaProjectionColumn,
): readonly string[] {
  const [from, to] = simAthenaProjectionBounds(column);

  if (/NOW/i.test(from) || /NOW/i.test(to)) {
    throw new SimAthenaProjectionError(
      `Partition column ${column.name} is projected as an integer and its ` +
        `range carries NOW, which belongs to a date projection`,
    );
  }

  const start = wholeBound(column, from);
  const end = wholeBound(column, to);
  const step = column.interval ?? 1;
  const values: string[] = [];

  for (let value = start; value <= end; value += step) {
    values.push(padded(value, column.digits));
    simAthenaGuardProjectionSize(column, values.length);
  }

  return values;
}

function padded(value: number, digits: number | undefined): string {
  const text = String(Math.abs(value));
  const padding = digits === undefined ? text : text.padStart(digits, "0");

  return value < 0 ? `-${padding}` : padding;
}

function wholeBound(column: SimAthenaProjectionColumn, bound: string): number {
  const parsed = Number(bound.trim());

  if (!Number.isSafeInteger(parsed)) {
    throw new SimAthenaProjectionError(
      `Partition column ${column.name} is projected as an integer and its ` +
        `range bound ${bound} is no whole number`,
    );
  }

  return parsed;
}
