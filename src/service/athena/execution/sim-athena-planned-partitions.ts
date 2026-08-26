import { SimAthenaProjectionError } from "../projection/sim-athena-projection-error.js";
import type { SimAthenaTablePartition } from "../projection/sim-athena-projection-location.js";
import { simAthenaTablePartitions } from "../projection/sim-athena-table-partitions.js";
import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import type { SimAthenaCatalog } from "../table/sim-athena-table-resolution.js";

/** One table a query reads, with the partitions of it the query reaches. */
export interface SimAthenaPlannedTable {
  readonly table: SimAthenaCatalogTable;
  readonly partitions: readonly SimAthenaTablePartition[];
}

interface SimAthenaPlannedPartitionsRequest {
  readonly tables: readonly SimAthenaCatalogTable[];
  readonly catalog: SimAthenaCatalog | undefined;
  readonly queryString: string;
  readonly now: Date;
}

/** What reading every table's partitions came to. */
export interface SimAthenaPlannedPartitions {
  readonly refusal: string | undefined;
  readonly planned: readonly SimAthenaPlannedTable[];
}

/**
 * The partitions every table a query names comes to.
 *
 * Glue accepts any projection parameters it is given, so a projection with a
 * mistake in it is found here, when a query first asks what partitions the
 * table has.
 */
export function simAthenaPlannedPartitions(
  request: SimAthenaPlannedPartitionsRequest,
): SimAthenaPlannedPartitions {
  const planned: SimAthenaPlannedTable[] = [];

  for (const table of request.tables) {
    try {
      planned.push({ table, partitions: partitionsOf(request, table) });
    } catch (error) {
      if (error instanceof SimAthenaProjectionError) {
        return { refusal: error.message, planned: [] };
      }

      throw error;
    }
  }

  return { refusal: undefined, planned };
}

function partitionsOf(
  request: SimAthenaPlannedPartitionsRequest,
  table: SimAthenaCatalogTable,
): readonly SimAthenaTablePartition[] {
  return simAthenaTablePartitions({
    table,
    registered:
      request.catalog?.partitionsInTable(table.databaseName, table.name) ?? [],
    queryString: request.queryString,
    now: request.now,
  });
}
