import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { requiredSimGlueName } from "../../database/sim-glue-catalog-name.js";
import type { SimGlueDatabaseStore } from "../../database/sim-glue-database-store.js";
import type { SimGlueTableStore } from "../../table/sim-glue-table-store.js";
import {
  requiredSimGlueColumns,
  requiredSimGlueStorageDescriptor,
} from "../../table/sim-glue-table-input-shape.js";
import type { SimGlueAuthorizer } from "../authorize/sim-glue-authorizer.js";
import { requireSimGlueCatalogId } from "../sim-glue-catalog-id.js";
import type { SimGlueRequestOptions } from "../sim-glue-request-options.js";
import type {
  SimCreateTableCommand,
  SimCreateTableCommandOutput,
  SimDeleteTableCommand,
  SimDeleteTableCommandOutput,
  SimGetTableCommand,
  SimGetTableCommandOutput,
  SimGetTablesCommand,
  SimGetTablesCommandOutput,
} from "./table.command.js";
import { simGlueTableDetail } from "./sim-glue-table-detail.js";

interface SimGlueTableCommandsProperties {
  readonly databases: SimGlueDatabaseStore;
  readonly tables: SimGlueTableStore;
  readonly authorizer: SimGlueAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * The commands that make, read and remove Glue tables.
 */
export class SimGlueTableCommands {
  readonly #databases: SimGlueDatabaseStore;
  readonly #tables: SimGlueTableStore;
  readonly #authorizer: SimGlueAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #clock: SimClock;

  constructor(properties: SimGlueTableCommandsProperties) {
    this.#databases = properties.databases;
    this.#tables = properties.tables;
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
    this.#clock = properties.clock;
  }

  /**
   * Make a table in a database.
   *
   * The database has to be there. Real Glue answers `EntityNotFoundException`
   * for one that is absent rather than creating it on the way past.
   */
  createTable(
    command: SimCreateTableCommand,
    options?: SimGlueRequestOptions,
  ): SimCreateTableCommandOutput {
    requireSimGlueCatalogId(this.#accountRegionScope, command.input.CatalogId);

    const databaseName = requiredSimGlueName(
      "DatabaseName",
      command.input.DatabaseName,
    );
    const input = command.input.TableInput ?? {};
    const name = requiredSimGlueName(
      "TableInput.Name",
      input.Name ?? command.input.Name,
    );

    this.#authorizer.authorizeTable(
      "glue:CreateTable",
      databaseName,
      name,
      options?.caller,
    );

    this.#databases.require(databaseName);
    this.#tables.create(databaseName, name, this.#clock.now(), {
      description: input.Description,
      owner: input.Owner,
      retention: input.Retention,
      tableType: input.TableType,
      partitionKeys: requiredSimGlueColumns(
        "TableInput.PartitionKeys",
        input.PartitionKeys,
      ),
      storageDescriptor: requiredSimGlueStorageDescriptor(
        "TableInput.StorageDescriptor",
        input.StorageDescriptor,
      ),
      parameters: input.Parameters,
    });

    return { $metadata: {} };
  }

  /**
   * Read a table back, with its storage descriptor, partition keys and
   * parameters as they were declared.
   */
  getTable(
    command: SimGetTableCommand,
    options?: SimGlueRequestOptions,
  ): SimGetTableCommandOutput {
    requireSimGlueCatalogId(this.#accountRegionScope, command.input.CatalogId);

    const databaseName = requiredSimGlueName(
      "DatabaseName",
      command.input.DatabaseName,
    );
    const name = requiredSimGlueName("Name", command.input.Name);

    this.#authorizer.authorizeTable(
      "glue:GetTable",
      databaseName,
      name,
      options?.caller,
    );

    this.#databases.require(databaseName);

    return {
      Table: simGlueTableDetail(this.#tables.require(databaseName, name)),
      $metadata: {},
    };
  }

  /**
   * Read every table in one database, in creation order.
   */
  getTables(
    command: SimGetTablesCommand,
    options?: SimGlueRequestOptions,
  ): SimGetTablesCommandOutput {
    requireSimGlueCatalogId(this.#accountRegionScope, command.input.CatalogId);

    const databaseName = requiredSimGlueName(
      "DatabaseName",
      command.input.DatabaseName,
    );

    this.#authorizer.authorizeDatabase(
      "glue:GetTables",
      databaseName,
      options?.caller,
    );

    this.#databases.require(databaseName);

    return {
      TableList: this.#tables.inDatabase(databaseName).map(simGlueTableDetail),
      $metadata: {},
    };
  }

  /**
   * Remove a table.
   */
  deleteTable(
    command: SimDeleteTableCommand,
    options?: SimGlueRequestOptions,
  ): SimDeleteTableCommandOutput {
    requireSimGlueCatalogId(this.#accountRegionScope, command.input.CatalogId);

    const databaseName = requiredSimGlueName(
      "DatabaseName",
      command.input.DatabaseName,
    );
    const name = requiredSimGlueName("Name", command.input.Name);

    this.#authorizer.authorizeTable(
      "glue:DeleteTable",
      databaseName,
      name,
      options?.caller,
    );

    this.#tables.require(databaseName, name);
    this.#tables.delete(databaseName, name);

    return { $metadata: {} };
  }
}
