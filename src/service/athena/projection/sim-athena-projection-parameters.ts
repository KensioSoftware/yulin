import type { SimAthenaProjection } from "./sim-athena-projection-column.js";
import { simAthenaProjectionColumnOf } from "./sim-athena-projection-column-parameters.js";

/** What a table carries for reading a projection out of. */
export interface SimAthenaProjectedTable {
  readonly parameters: Readonly<Record<string, string>>;
  readonly partitionKeys: readonly { Name: string }[];
}

/**
 * Read a table's partition projection out of its Glue parameters.
 *
 * Every partition key needs a projection type once projection is enabled,
 * since Athena has no other way to know what a column's values are. A key
 * without one fails here, naming the key.
 */
export function simAthenaProjectionOf(
  table: SimAthenaProjectedTable,
): SimAthenaProjection {
  const parameters = table.parameters;
  const enabled = parameters["projection.enabled"]?.toLowerCase() === "true";

  if (!enabled) {
    return { enabled: false, locationTemplate: undefined, columns: [] };
  }

  return {
    enabled: true,
    locationTemplate: parameters["storage.location.template"],
    columns: table.partitionKeys.map((key) =>
      simAthenaProjectionColumnOf(key.Name, parameters),
    ),
  };
}
