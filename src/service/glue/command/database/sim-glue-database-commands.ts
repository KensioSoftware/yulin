import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requiredSimGlueName } from "../../database/sim-glue-catalog-name.js";
import type { SimGlueDatabaseStore } from "../../database/sim-glue-database-store.js";
import type { SimGlueTableStore } from "../../table/sim-glue-table-store.js";
import type { SimGlueAuthorizer } from "../authorize/sim-glue-authorizer.js";
import { requireSimGlueCatalogId } from "../sim-glue-catalog-id.js";
import type { SimGlueRequestOptions } from "../sim-glue-request-options.js";
import type {
  SimCreateDatabaseCommand,
  SimCreateDatabaseCommandOutput,
  SimDeleteDatabaseCommand,
  SimDeleteDatabaseCommandOutput,
  SimGetDatabaseCommand,
  SimGetDatabaseCommandOutput,
  SimGetDatabasesCommand,
  SimGetDatabasesCommandOutput,
} from "./database.command.js";
import { simGlueDatabaseDetail } from "./sim-glue-database-detail.js";

interface SimGlueDatabaseCommandsProperties {
  readonly databases: SimGlueDatabaseStore;
  readonly tables: SimGlueTableStore;
  readonly authorizer: SimGlueAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * The commands that make, read and remove Glue databases.
 */
export class SimGlueDatabaseCommands {
  readonly #databases: SimGlueDatabaseStore;
  readonly #tables: SimGlueTableStore;
  readonly #authorizer: SimGlueAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #clock: SimClock;

  constructor(properties: SimGlueDatabaseCommandsProperties) {
    this.#databases = properties.databases;
    this.#tables = properties.tables;
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
    this.#clock = properties.clock;
  }

  /**
   * Make a database.
   *
   * Creation is not idempotent on real Glue, so a name already in use fails
   * rather than answering with the database that is there.
   */
  createDatabase(
    command: SimCreateDatabaseCommand,
    options?: SimGlueRequestOptions,
  ): SimCreateDatabaseCommandOutput {
    requireSimGlueCatalogId(this.#accountRegionScope, command.input.CatalogId);

    const input = command.input.DatabaseInput ?? {};
    const name = requiredSimGlueName("DatabaseInput.Name", input.Name);

    this.#authorizer.authorizeDatabase(
      "glue:CreateDatabase",
      name,
      options?.caller,
    );

    this.#databases.create(name, this.#clock.now(), {
      description: input.Description,
      locationUri: input.LocationUri,
      parameters: input.Parameters,
    });

    return { $metadata: {} };
  }

  /**
   * Read a database back.
   */
  getDatabase(
    command: SimGetDatabaseCommand,
    options?: SimGlueRequestOptions,
  ): SimGetDatabaseCommandOutput {
    requireSimGlueCatalogId(this.#accountRegionScope, command.input.CatalogId);

    const name = requiredSimGlueName("Name", command.input.Name);

    this.#authorizer.authorizeDatabase(
      "glue:GetDatabase",
      name,
      options?.caller,
    );

    return {
      Database: simGlueDatabaseDetail(this.#databases.require(name)),
      $metadata: {},
    };
  }

  /**
   * Read every database in this catalog, in creation order.
   */
  getDatabases(
    command: SimGetDatabasesCommand,
    options?: SimGlueRequestOptions,
  ): SimGetDatabasesCommandOutput {
    requireSimGlueCatalogId(this.#accountRegionScope, command.input.CatalogId);

    this.#authorizer.authorizeCatalog("glue:GetDatabases", options?.caller);

    return {
      DatabaseList: this.#databases.all.map(simGlueDatabaseDetail),
      $metadata: {},
    };
  }

  /**
   * Remove a database, and the tables it holds with it.
   */
  deleteDatabase(
    command: SimDeleteDatabaseCommand,
    options?: SimGlueRequestOptions,
  ): SimDeleteDatabaseCommandOutput {
    requireSimGlueCatalogId(this.#accountRegionScope, command.input.CatalogId);

    const name = requiredSimGlueName("Name", command.input.Name);

    this.#authorizer.authorizeDatabaseDeletion(
      name,
      this.#tables.inDatabase(name).map((table) => table.name),
      options?.caller,
    );

    this.#databases.require(name);
    this.#databases.delete(name);
    this.#tables.deleteDatabase(name);

    return { $metadata: {} };
  }
}
