import { simAthenaPartitionFilters } from "../table/sim-athena-partition-filters.js";
import type { SimAthenaProjectionColumn } from "./sim-athena-projection-column.js";
import { SimAthenaProjectionError } from "./sim-athena-projection-error.js";
import {
  simAthenaProjectedPartitions,
  type SimAthenaTablePartition,
} from "./sim-athena-projection-location.js";
import {
  simAthenaProjectionOf,
  type SimAthenaProjectedTable,
} from "./sim-athena-projection-parameters.js";
import { simAthenaProjectedValues } from "./sim-athena-projection-values.js";

/** The table a query names, as reading its partitions needs it. */
export interface SimAthenaPartitionedTable extends SimAthenaProjectedTable {
  readonly storageDescriptor:
    | { readonly Location?: string | undefined }
    | undefined;
}

interface SimAthenaTablePartitionsRequest {
  readonly table: SimAthenaPartitionedTable;
  readonly queryString: string;
  readonly now: Date;
}

/**
 * The partitions one query reads for one table.
 *
 * A table with projection off reads its own location and nothing else, since
 * the partitions it holds were registered rather than projected and simulated
 * Glue has no commands for registering one. Nothing then says what its
 * partition columns read, so that partition carries no values.
 *
 * With projection on, every column is expanded and the query's own `WHERE`
 * clause narrows what is left. A filter naming no projected column leaves
 * every partition in, which is what a query scanning the whole table does.
 */
export function simAthenaTablePartitions(
  request: SimAthenaTablePartitionsRequest,
): readonly SimAthenaTablePartition[] {
  const projection = simAthenaProjectionOf(request.table);
  const location = request.table.storageDescriptor?.Location;

  if (!projection.enabled) {
    return location === undefined
      ? []
      : [{ prefix: location, values: new Map() }];
  }

  const filters = simAthenaPartitionFilters(request.queryString);
  const values = new Map<string, readonly string[]>();

  for (const column of projection.columns) {
    values.set(
      column.name,
      valuesFor(column, filters.valuesFor(column.name), request.now),
    );
  }

  return simAthenaProjectedPartitions(projection, values, location);
}

/**
 * The values one column takes for this query.
 *
 * An injected column has no values of its own, so the query has to name them.
 * Athena refuses a query that leaves one unconstrained, because projecting
 * every possible value of an arbitrary string is no projection at all.
 */
function valuesFor(
  column: SimAthenaProjectionColumn,
  filtered: readonly string[] | undefined,
  now: Date,
): readonly string[] {
  const projected = simAthenaProjectedValues(column, now);

  if (projected === undefined) {
    if (filtered === undefined) {
      throw new SimAthenaProjectionError(
        `Partition column ${column.name} is projected as injected, and a ` +
          `query has to constrain it with an equality or an IN`,
      );
    }

    return filtered;
  }

  if (filtered === undefined) {
    return projected;
  }

  const wanted = new Set(filtered);

  return projected.filter((value) => wanted.has(value));
}
