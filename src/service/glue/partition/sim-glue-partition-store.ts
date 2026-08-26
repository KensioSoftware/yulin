import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simGlueFolded } from "../database/sim-glue-catalog-name.js";
import { SimGlueTablePartitions } from "./sim-glue-table-partitions.js";

interface SimGluePartitionStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The registered partitions of one simulated Glue catalog.
 *
 * Keyed by database name and then by table name, following the table store, so
 * a table's partitions go with it when it is deleted and a database's go with
 * the database.
 *
 * Each table's partitions are one object, which is what a partition command
 * works through once it has resolved the table it was given.
 *
 * Both names are folded to lower case, as they are in the table store, so a
 * partition is reached under whatever spelling the table is asked for.
 */
export class SimGluePartitionStore {
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #tables = new Map<string, Map<string, SimGlueTablePartitions>>();

  constructor(properties: SimGluePartitionStoreProperties) {
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * The partitions of one table, empty until something registers one.
   */
  inTable(
    declaredDatabase: string,
    declaredTable: string,
  ): SimGlueTablePartitions {
    const databaseName = simGlueFolded(declaredDatabase);
    const tableName = simGlueFolded(declaredTable);

    return mapEntry(
      this.#inDatabase(databaseName),
      tableName,
      () =>
        new SimGlueTablePartitions({
          databaseName,
          tableName,
          accountRegionScope: this.#accountRegionScope,
        }),
    );
  }

  /** Remove every partition of a table, as deleting the table does. */
  deleteTable(databaseName: string, tableName: string): void {
    this.#tables
      .get(simGlueFolded(databaseName))
      ?.delete(simGlueFolded(tableName));
  }

  /** Remove every partition in a database, as deleting the database does. */
  deleteDatabase(databaseName: string): void {
    this.#tables.delete(simGlueFolded(databaseName));
  }

  #inDatabase(databaseName: string): Map<string, SimGlueTablePartitions> {
    return mapEntry(
      this.#tables,
      databaseName,
      () => new Map<string, SimGlueTablePartitions>(),
    );
  }
}

function mapEntry<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  const existing = map.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const created = make();
  map.set(key, created);

  return created;
}

export { type SimGluePartitionInput } from "./sim-glue-partition-schema.js";
