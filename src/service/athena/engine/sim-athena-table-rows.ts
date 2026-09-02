import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaPlannedTable } from "../execution/sim-athena-query-refusal.js";
import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import type { SimAthenaEngineRow } from "./sim-athena-engine-row.js";
import { simAthenaHivePartitionValues } from "./sim-athena-hive-partitions.js";
import {
  simAthenaPartitionedObjects,
  type SimAthenaPartitionedObject,
} from "./sim-athena-partitioned-objects.js";
import {
  simAthenaRecordReader,
  type SimAthenaRecordReader,
} from "./sim-athena-record-reader.js";
import {
  simAthenaObjectBytes,
  type SimAthenaTableObjects,
} from "./sim-athena-table-objects.js";

/** One table a query reads, with the rows the engine loaded for it. */
export interface SimAthenaLoadedTable {
  readonly table: SimAthenaCatalogTable;
  readonly rows: readonly SimAthenaEngineRow[];
}

interface SimAthenaTableRowsRequest {
  readonly planned: SimAthenaPlannedTable;
  readonly objects: SimAthenaTableObjects;
  readonly caller: SimAwsCaller | undefined;
}

/**
 * Every row one table holds for this query, or nothing where the engine has no
 * reader for what the table declares.
 *
 * The rows come from the objects under the partitions the plan reached, so a
 * query the partition filter narrowed reads only the partitions it left.
 */
export async function simAthenaTableRows(
  request: SimAthenaTableRowsRequest,
): Promise<SimAthenaLoadedTable | undefined> {
  const { table } = request.planned;
  const reader = simAthenaRecordReader(table);

  if (reader === undefined) {
    return undefined;
  }

  const objects = await simAthenaPartitionedObjects(
    { s3: request.objects, caller: request.caller },
    request.planned.partitions,
  );
  const rows = await Promise.all(
    objects.map(async (one) => objectRows(request, reader, one)),
  );

  return { table, rows: rows.flat() };
}

/**
 * One object's rows, each carrying the partition it sits in.
 *
 * A partition column is written into the key path rather than into the data,
 * and with a `storage.location.template` it need not be written anywhere at
 * all. The projection is what knows, so its values are laid down first and the
 * Hive style `key=value` segments of the object's own key fill in behind them.
 * A field the record itself carries wins over both.
 */
async function objectRows(
  request: SimAthenaTableRowsRequest,
  reader: SimAthenaRecordReader,
  one: SimAthenaPartitionedObject,
): Promise<readonly SimAthenaEngineRow[]> {
  const bytes = await simAthenaObjectBytes(
    request.objects,
    one.object.bucket,
    one.object.key,
    request.caller,
  );
  const partition = {
    ...simAthenaHivePartitionValues(one.object.key),
    ...Object.fromEntries(one.values),
  };

  const rows = await reader(bytes);

  return rows.map((row) => ({ ...partition, ...row }));
}
