import type { SimClock } from "../../../util/clock/sim-clock.js";
import type {
  SimGlueDatabaseInput,
  SimGlueDatabaseStore,
} from "../database/sim-glue-database-store.js";
import type { SimGlueDatabase } from "../database/sim-glue-database.js";
import type { SimGluePartition } from "../partition/sim-glue-partition.js";
import type {
  SimGluePartitionInput,
  SimGluePartitionStore,
} from "../partition/sim-glue-partition-store.js";
import type {
  SimGlueTableInput,
  SimGlueTableStore,
} from "../table/sim-glue-table-store.js";
import type { SimGlueTable } from "../table/sim-glue-table.js";

interface SimGlueCatalogWriterProperties {
  readonly databases: SimGlueDatabaseStore;
  readonly tables: SimGlueTableStore;
  readonly partitions: SimGluePartitionStore;
  readonly clock: SimClock;
}

/**
 * How something other than an SDK caller writes to the catalog.
 *
 * CloudFormation deploys as itself rather than as the caller a later request
 * carries, so a Resource creator writes through here and skips the IAM
 * authorization an SDK Command goes through. The store refusals still apply,
 * so a stack declaring two tables of one name in one database fails the way
 * two `CreateTable` calls would.
 */
export class SimGlueCatalogWriter {
  readonly #databases: SimGlueDatabaseStore;
  readonly #tables: SimGlueTableStore;
  readonly #partitions: SimGluePartitionStore;
  readonly #clock: SimClock;

  constructor(properties: SimGlueCatalogWriterProperties) {
    this.#databases = properties.databases;
    this.#tables = properties.tables;
    this.#partitions = properties.partitions;
    this.#clock = properties.clock;
  }

  /** Make a database. */
  createDatabase(name: string, input: SimGlueDatabaseInput): SimGlueDatabase {
    return this.#databases.create(name, this.#clock.now(), input);
  }

  /** Remove a database, and the tables and partitions it holds with it. */
  deleteDatabase(name: string): void {
    this.#databases.delete(name);
    this.#tables.deleteDatabase(name);
    this.#partitions.deleteDatabase(name);
  }

  /**
   * Make a table in a database, refusing one whose database is absent.
   */
  createTable(
    databaseName: string,
    name: string,
    input: SimGlueTableInput,
  ): SimGlueTable {
    this.#databases.require(databaseName);

    return this.#tables.create(databaseName, name, this.#clock.now(), input);
  }

  /** Remove a table, and the partitions registered against it with it. */
  deleteTable(databaseName: string, name: string): void {
    this.#tables.delete(databaseName, name);
    this.#partitions.deleteTable(databaseName, name);
  }

  /**
   * Register a partition against a table, refusing one whose table is absent.
   *
   * The values are taken as given. Nothing here checks them against the
   * table's partition keys, since a Command does that while reading its input.
   */
  createPartition(
    databaseName: string,
    tableName: string,
    values: readonly string[],
    input: SimGluePartitionInput = {},
  ): SimGluePartition {
    this.#tables.require(databaseName, tableName);

    return this.#partitions
      .inTable(databaseName, tableName)
      .create(values, this.#clock.now(), input);
  }

  /** Remove a partition. */
  deletePartition(
    databaseName: string,
    tableName: string,
    values: readonly string[],
  ): void {
    this.#partitions.inTable(databaseName, tableName).delete(values);
  }
}
