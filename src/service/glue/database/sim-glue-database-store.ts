import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  refuseSimGlueNameInPlace,
  requireSimGlueFound,
} from "../error/sim-glue-catalog-refusal.js";
import { simGlueFolded } from "./sim-glue-catalog-name.js";
import { SimGlueDatabase } from "./sim-glue-database.js";

interface SimGlueDatabaseStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/** What a database is created with, beyond its name. */
export interface SimGlueDatabaseInput {
  readonly description?: string | undefined;
  readonly locationUri?: string | undefined;
  readonly parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * The databases of one simulated Glue catalog.
 *
 * Keyed by name, which is the whole of a database's identity within one
 * account and region. Every name is folded to lower case on the way in and on
 * the way to a lookup, the way the Data Catalog folds one when it stores it.
 */
export class SimGlueDatabaseStore {
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #databases = new Map<string, SimGlueDatabase>();

  constructor(properties: SimGlueDatabaseStoreProperties) {
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /** Every database in this catalog, in creation order. */
  get all(): readonly SimGlueDatabase[] {
    return this.#databases.values().toArray();
  }

  /**
   * Make a database, refusing a name that is taken.
   */
  create(
    declared: string,
    createTime: Date,
    input: SimGlueDatabaseInput = {},
  ): SimGlueDatabase {
    const name = simGlueFolded(declared);

    refuseSimGlueNameInPlace(this.#databases.has(name), "Database", name);

    const database = new SimGlueDatabase({
      name,
      accountRegionScope: this.#accountRegionScope,
      createTime,
      ...input,
    });

    this.#databases.set(name, database);

    return database;
  }

  /** Find a database by name, however it was spelled. */
  find(name: string): SimGlueDatabase | undefined {
    return this.#databases.get(simGlueFolded(name));
  }

  /**
   * Get a database by name, refusing one that is absent.
   */
  require(name: string): SimGlueDatabase {
    return requireSimGlueFound(
      this.find(name),
      "Database",
      simGlueFolded(name),
    );
  }

  /** Remove a database. */
  delete(name: string): void {
    this.#databases.delete(simGlueFolded(name));
  }
}
