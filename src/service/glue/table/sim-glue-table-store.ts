import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimGlueAlreadyExistsException,
  SimGlueEntityNotFoundException,
} from "../error/sim-glue.error.js";
import { SimGlueTable } from "./sim-glue-table.js";
import type { SimGlueTableInput } from "./sim-glue-table-schema.js";

interface SimGlueTableStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The tables of one simulated Glue catalog.
 *
 * Keyed by database name and then by table name, so a database's tables go
 * with it when it is deleted, and so two databases may hold a table of the
 * same name.
 */
export class SimGlueTableStore {
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #tables = new Map<string, Map<string, SimGlueTable>>();

  constructor(properties: SimGlueTableStoreProperties) {
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Make a table, refusing a name already taken in the same database.
   */
  create(
    databaseName: string,
    name: string,
    createTime: Date,
    input: SimGlueTableInput = {},
  ): SimGlueTable {
    const inDatabase = this.#inDatabase(databaseName);

    if (inDatabase.has(name)) {
      throw new SimGlueAlreadyExistsException(`Table already exists: ${name}`);
    }

    const table = new SimGlueTable({
      name,
      databaseName,
      accountRegionScope: this.#accountRegionScope,
      createTime,
      ...input,
    });

    inDatabase.set(name, table);

    return table;
  }

  /** Find a table by database and name. */
  find(databaseName: string, name: string): SimGlueTable | undefined {
    return this.#tables.get(databaseName)?.get(name);
  }

  /**
   * Get a table by database and name, refusing one that is absent.
   */
  require(databaseName: string, name: string): SimGlueTable {
    const table = this.find(databaseName, name);

    if (table === undefined) {
      throw new SimGlueEntityNotFoundException(
        `Table not found: ${databaseName}.${name}`,
      );
    }

    return table;
  }

  /** Every table in one database, in creation order. */
  inDatabase(databaseName: string): readonly SimGlueTable[] {
    return this.#tables.get(databaseName)?.values().toArray() ?? [];
  }

  /** Remove a table. */
  delete(databaseName: string, name: string): void {
    this.#tables.get(databaseName)?.delete(name);
  }

  /** Remove every table in a database, as deleting the database does. */
  deleteDatabase(databaseName: string): void {
    this.#tables.delete(databaseName);
  }

  #inDatabase(databaseName: string): Map<string, SimGlueTable> {
    const existing = this.#tables.get(databaseName);

    if (existing !== undefined) {
      return existing;
    }

    const created = new Map<string, SimGlueTable>();
    this.#tables.set(databaseName, created);

    return created;
  }
}

export { type SimGlueTableInput } from "./sim-glue-table-schema.js";
