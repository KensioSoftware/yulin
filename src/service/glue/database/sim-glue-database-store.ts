import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimGlueAlreadyExistsException,
  SimGlueEntityNotFoundException,
} from "../error/sim-glue.error.js";
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
 * account and region.
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
    name: string,
    createTime: Date,
    input: SimGlueDatabaseInput = {},
  ): SimGlueDatabase {
    if (this.#databases.has(name)) {
      throw new SimGlueAlreadyExistsException(
        `Database already exists: ${name}`,
      );
    }

    const database = new SimGlueDatabase({
      name,
      accountRegionScope: this.#accountRegionScope,
      createTime,
      ...input,
    });

    this.#databases.set(name, database);

    return database;
  }

  /** Find a database by name. */
  find(name: string): SimGlueDatabase | undefined {
    return this.#databases.get(name);
  }

  /**
   * Get a database by name, refusing one that is absent.
   */
  require(name: string): SimGlueDatabase {
    const database = this.find(name);

    if (database === undefined) {
      throw new SimGlueEntityNotFoundException(`Database not found: ${name}`);
    }

    return database;
  }

  /** Remove a database. */
  delete(name: string): void {
    this.#databases.delete(name);
  }
}
