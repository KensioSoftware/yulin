import {
  simAthenaHivePrefix,
  simAthenaLocationPrefix,
  type SimAthenaTablePartition,
} from "../projection/sim-athena-projection-location.js";
import {
  simAthenaPartitionFilters,
  type SimAthenaPartitionFilters,
} from "./sim-athena-partition-filters.js";

/** One partition the catalog holds, as reading it needs it. */
export interface SimAthenaCatalogPartition {
  readonly values: readonly string[];
  readonly storageDescriptor:
    | { readonly Location?: string | undefined }
    | undefined;
}

interface SimAthenaRegisteredPartitionsRequest {
  readonly partitionKeys: readonly { Name: string }[];
  readonly registered: readonly SimAthenaCatalogPartition[];
  readonly tableLocation: string | undefined;
  readonly queryString: string;
}

/**
 * The registered partitions one query reads for one table.
 *
 * A crawler, `MSCK REPAIR TABLE` or a Glue job puts these in the catalog, and
 * each one says where its own objects sit. That location need not be under the
 * table's, which is why a query reads one prefix per partition rather than the
 * table's location alone.
 *
 * The query's `WHERE` clause narrows them through the same reader that narrows
 * a projection, so a query pinning one day reads one day's objects.
 */
export function simAthenaRegisteredPartitions(
  request: SimAthenaRegisteredPartitionsRequest,
): readonly SimAthenaTablePartition[] {
  const filters = simAthenaPartitionFilters(request.queryString);
  const partitions: SimAthenaTablePartition[] = [];

  for (const registered of request.registered) {
    const values = valuesOf(request.partitionKeys, registered.values);

    if (!allows(filters, values)) {
      continue;
    }

    const prefix = prefixOf(registered, values, request.tableLocation);

    if (prefix !== undefined) {
      partitions.push({ prefix, values });
    }
  }

  return partitions;
}

/**
 * What each partition column reads for the rows under this partition.
 *
 * A partition's values are positional against the table's partition keys, the
 * way the catalog stores them.
 */
function valuesOf(
  partitionKeys: readonly { Name: string }[],
  values: readonly string[],
): ReadonlyMap<string, string> {
  return new Map(
    partitionKeys.map((key, index) => [key.Name, values.at(index) ?? ""]),
  );
}

/** Whether the query's filters leave this partition in. */
function allows(
  filters: SimAthenaPartitionFilters,
  values: ReadonlyMap<string, string>,
): boolean {
  return values
    .entries()
    .every(([name, value]) => filters.valuesFor(name)?.includes(value) ?? true);
}

/**
 * Where one partition's objects sit, or nothing where there is nowhere to
 * look.
 *
 * A partition registered with no location of its own falls back to the Hive
 * layout under the table's location, as Athena resolves one. A partition with
 * neither has no prefix, and a table with no location reads nothing either
 * way.
 */
function prefixOf(
  registered: SimAthenaCatalogPartition,
  values: ReadonlyMap<string, string>,
  tableLocation: string | undefined,
): string | undefined {
  const location = registered.storageDescriptor?.Location;

  if (location !== undefined) {
    return simAthenaLocationPrefix(location);
  }

  return tableLocation === undefined
    ? undefined
    : simAthenaHivePrefix(tableLocation, values);
}
