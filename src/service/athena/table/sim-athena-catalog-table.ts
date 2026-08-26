import type { SimAthenaPartitionedTable } from "../projection/sim-athena-table-partitions.js";

/**
 * One column of a catalog table, or one partition key.
 *
 * Real Glue uses the same `Column` shape for both, and the type is written the
 * way Hive writes it: `string`, `int`, `bigint`, `boolean` and so on.
 */
export interface SimAthenaCatalogColumn {
  readonly Name: string;
  readonly Type?: string | undefined;
}

/** How one table's rows are serialized, and where they sit. */
export interface SimAthenaCatalogSerDe {
  readonly SerializationLibrary?: string | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/** Where a catalog table's data lives and how it is read. */
export interface SimAthenaCatalogStorage {
  readonly Location?: string | undefined;
  readonly SerdeInfo?: SimAthenaCatalogSerDe | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * One Glue table, as simulated Athena reads it.
 *
 * `SimGlueTable` structurally implements this, the way `SimS3` implements
 * `SimAthenaResultDestination`. Partition projection needs the parameters, the
 * partition keys and the location; the query engine needs the rest, since it
 * builds a SQLite table out of the schema and decodes the objects with the
 * SerDe.
 */
export interface SimAthenaCatalogTable extends SimAthenaPartitionedTable {
  readonly name: string;
  readonly databaseName: string;
  readonly columns: readonly SimAthenaCatalogColumn[];
  readonly partitionKeys: readonly SimAthenaCatalogColumn[];
  readonly storageDescriptor: SimAthenaCatalogStorage | undefined;
}
