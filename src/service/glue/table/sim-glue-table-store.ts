import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simGlueFolded } from "../database/sim-glue-catalog-name.js";
import {
  refuseSimGlueNameInPlace,
  requireSimGlueFound,
} from "../error/sim-glue-catalog-refusal.js";
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
 *
 * Both names are folded to lower case, the way the Data Catalog folds one when
 * it stores it. Two tables differing only by case are one table here, as they
 * are on real Glue.
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
    declaredDatabase: string,
    declaredName: string,
    createTime: Date,
    input: SimGlueTableInput = {},
  ): SimGlueTable {
    const databaseName = simGlueFolded(declaredDatabase);
    const name = simGlueFolded(declaredName);
    const inDatabase = this.#inDatabase(databaseName);

    refuseSimGlueNameInPlace(inDatabase.has(name), "Table", name);

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

  /** Find a table by database and name, however either was spelled. */
  find(databaseName: string, name: string): SimGlueTable | undefined {
    return this.#found(databaseName)?.get(simGlueFolded(name));
  }

  /**
   * Get a table by database and name, refusing one that is absent.
   */
  require(databaseName: string, name: string): SimGlueTable {
    return requireSimGlueFound(
      this.find(databaseName, name),
      "Table",
      `${simGlueFolded(databaseName)}.${simGlueFolded(name)}`,
    );
  }

  /** Every table in one database, in creation order. */
  inDatabase(databaseName: string): readonly SimGlueTable[] {
    return this.#found(databaseName)?.values().toArray() ?? [];
  }

  /** Remove a table. */
  delete(databaseName: string, name: string): void {
    this.#found(databaseName)?.delete(simGlueFolded(name));
  }

  /** Remove every table in a database, as deleting the database does. */
  deleteDatabase(databaseName: string): void {
    this.#tables.delete(simGlueFolded(databaseName));
  }

  /** The tables of one database, however its name was spelled. */
  #found(databaseName: string): Map<string, SimGlueTable> | undefined {
    return this.#tables.get(simGlueFolded(databaseName));
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
