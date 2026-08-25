import type { SimClock } from "../../../util/clock/sim-clock.js";
import type {
  SimGlueDatabaseInput,
  SimGlueDatabaseStore,
} from "../database/sim-glue-database-store.js";
import type { SimGlueDatabase } from "../database/sim-glue-database.js";
import type {
  SimGlueTableInput,
  SimGlueTableStore,
} from "../table/sim-glue-table-store.js";
import type { SimGlueTable } from "../table/sim-glue-table.js";

interface SimGlueCatalogWriterProperties {
  readonly databases: SimGlueDatabaseStore;
  readonly tables: SimGlueTableStore;
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
  readonly #clock: SimClock;

  constructor(properties: SimGlueCatalogWriterProperties) {
    this.#databases = properties.databases;
    this.#tables = properties.tables;
    this.#clock = properties.clock;
  }

  /** Make a database. */
  createDatabase(name: string, input: SimGlueDatabaseInput): SimGlueDatabase {
    return this.#databases.create(name, this.#clock.now(), input);
  }

  /** Remove a database, and the tables it holds with it. */
  deleteDatabase(name: string): void {
    this.#databases.delete(name);
    this.#tables.deleteDatabase(name);
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

  /** Remove a table. */
  deleteTable(databaseName: string, name: string): void {
    this.#tables.delete(databaseName, name);
  }
}
