import type { SimAthenaProjectionColumn } from "./sim-athena-projection-column.js";
import {
  SimAthenaProjectionError,
  simAthenaProjectionLimit,
} from "./sim-athena-projection-error.js";

/** The two ends of a column's declared range. */
export function simAthenaProjectionBounds(
  column: SimAthenaProjectionColumn,
): readonly [string, string] {
  const parts = column.range?.split(",").map((bound) => bound.trim());

  if (
    parts?.length !== 2 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    parts[0].length === 0 ||
    parts[1].length === 0
  ) {
    throw new SimAthenaProjectionError(
      `Partition column ${column.name} needs projection.${column.name}.range ` +
        `written as two bounds separated by a comma`,
    );
  }

  return [parts[0], parts[1]];
}

/** Fail a column that runs away rather than generating for ever. */
export function simAthenaGuardProjectionSize(
  column: SimAthenaProjectionColumn,
  count: number,
): void {
  if (count > simAthenaProjectionLimit) {
    throw new SimAthenaProjectionError(
      `Partition column ${column.name} projects more than ` +
        `${String(simAthenaProjectionLimit)} values`,
    );
  }
}
