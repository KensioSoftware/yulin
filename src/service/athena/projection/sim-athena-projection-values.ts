import type { SimAthenaProjectionColumn } from "./sim-athena-projection-column.js";
import { SimAthenaProjectionError } from "./sim-athena-projection-error.js";
import { simAthenaDateValues } from "./sim-athena-projection-date.js";
import { simAthenaIntegerValues } from "./sim-athena-projection-integer.js";

/**
 * The values one projected column takes.
 *
 * An `injected` column has none of its own. Its value comes from the query's
 * `WHERE` clause, which is what injecting one means, so this answers
 * `undefined` for it and a caller supplies the value.
 */
export function simAthenaProjectedValues(
  column: SimAthenaProjectionColumn,
  now: Date,
): readonly string[] | undefined {
  if (column.type === "injected") {
    return undefined;
  }

  if (column.type === "enum") {
    return enumValues(column);
  }

  return column.type === "integer"
    ? simAthenaIntegerValues(column)
    : simAthenaDateValues(column, now);
}

function enumValues(column: SimAthenaProjectionColumn): readonly string[] {
  const values = column.values;

  if (values === undefined || values.length === 0) {
    throw new SimAthenaProjectionError(
      `Partition column ${column.name} is projected as an enum and has no ` +
        `projection.${column.name}.values`,
    );
  }

  return values;
}
