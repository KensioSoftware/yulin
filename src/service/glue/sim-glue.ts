import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimGlueAuthorizer } from "./command/authorize/sim-glue-authorizer.js";
import { SimGlueDatabaseCommands } from "./command/database/sim-glue-database-commands.js";
import type * as simGlueCommands from "./command/database/database.command.js";
import type * as simGlueTableCommands from "./command/table/table.command.js";
import { SimGlueTableCommands } from "./command/table/sim-glue-table-commands.js";
import type { SimGlueRequestOptions } from "./command/sim-glue-request-options.js";
import { SimGlueDatabaseStore } from "./database/sim-glue-database-store.js";
import type { SimGlueDatabase } from "./database/sim-glue-database.js";
import { SimGlueCfnResourceFactory } from "./cfn/sim-glue-cfn-resource-factory.js";
import { SimGlueSdkCommandRouter } from "./sdk/sim-glue-sdk-command-router.js";
import { SimGlueTableStore } from "./table/sim-glue-table-store.js";
import { SimGlueCatalogWriter } from "./write/sim-glue-catalog-writer.js";
import type { SimGlueTable } from "./table/sim-glue-table.js";

export interface SimGlueProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated Glue Data Catalog. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * A database and a table are metadata, so this holds definitions rather than
 * data. Nothing here reads an S3 object, and nothing evaluates the Athena
 * partition projection a table's parameters configure. What a table is for
 * here is asserting that a stack declared the definition it meant to.
 *
 * Databases and tables are scoped to an account and region, as they are on
 * real AWS: a catalog belongs to one account, and a database ARN names the
 * region.
 */
export class SimGlue {
  readonly #databases: SimGlueDatabaseStore;
  readonly #tables: SimGlueTableStore;
  readonly #databaseCommands: SimGlueDatabaseCommands;
  readonly #tableCommands: SimGlueTableCommands;
  readonly #catalogWriter: SimGlueCatalogWriter;

  readonly #sdkRouter = new SimGlueSdkCommandRouter(this);
  readonly #cfnFactory: SimGlueCfnResourceFactory;

  constructor(properties: SimGlueProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimGlueAuthorizer({ iam, accountRegionScope });

    this.#databases = new SimGlueDatabaseStore({ accountRegionScope });
    this.#tables = new SimGlueTableStore({ accountRegionScope });

    const collaborators = {
      databases: this.#databases,
      tables: this.#tables,
      authorizer,
      accountRegionScope,
      clock: background,
    };

    this.#databaseCommands = new SimGlueDatabaseCommands(collaborators);
    this.#tableCommands = new SimGlueTableCommands(collaborators);
    this.#catalogWriter = new SimGlueCatalogWriter({
      databases: this.#databases,
      tables: this.#tables,
      clock: background,
    });
    this.#cfnFactory = new SimGlueCfnResourceFactory({
      glue: this,
      catalogId: accountRegionScope.accountId,
    });
  }

  /**
   * How CloudFormation writes to this catalog, skipping the IAM authorization
   * an SDK Command goes through.
   */
  catalogWriter(): SimGlueCatalogWriter {
    return this.#catalogWriter;
  }

  /**
   * Find a database by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * catalog state without going through a Command and its authorization.
   */
  findDatabase(name: string): SimGlueDatabase | undefined {
    return this.#databases.find(name);
  }

  /**
   * Find a table by database and name, without going through a Command.
   */
  findTable(databaseName: string, name: string): SimGlueTable | undefined {
    return this.#tables.find(databaseName, name);
  }

  /** Every database in this catalog, in creation order. */
  allDatabases(): readonly SimGlueDatabase[] {
    return this.#databases.all;
  }

  /** Every table in one database, in creation order. */
  tablesInDatabase(databaseName: string): readonly SimGlueTable[] {
    return this.#tables.inDatabase(databaseName);
  }

  /** Make a database. */
  createDatabase(
    command: simGlueCommands.SimCreateDatabaseCommand,
    options?: SimGlueRequestOptions,
  ): simGlueCommands.SimCreateDatabaseCommandOutput {
    return this.#databaseCommands.createDatabase(command, options);
  }

  /** Read a database back. */
  getDatabase(
    command: simGlueCommands.SimGetDatabaseCommand,
    options?: SimGlueRequestOptions,
  ): simGlueCommands.SimGetDatabaseCommandOutput {
    return this.#databaseCommands.getDatabase(command, options);
  }

  /** Read every database in this catalog. */
  getDatabases(
    command: simGlueCommands.SimGetDatabasesCommand,
    options?: SimGlueRequestOptions,
  ): simGlueCommands.SimGetDatabasesCommandOutput {
    return this.#databaseCommands.getDatabases(command, options);
  }

  /** Remove a database, and the tables it holds with it. */
  deleteDatabase(
    command: simGlueCommands.SimDeleteDatabaseCommand,
    options?: SimGlueRequestOptions,
  ): simGlueCommands.SimDeleteDatabaseCommandOutput {
    return this.#databaseCommands.deleteDatabase(command, options);
  }

  /** Make a table in a database. */
  createTable(
    command: simGlueTableCommands.SimCreateTableCommand,
    options?: SimGlueRequestOptions,
  ): simGlueTableCommands.SimCreateTableCommandOutput {
    return this.#tableCommands.createTable(command, options);
  }

  /** Read a table back. */
  getTable(
    command: simGlueTableCommands.SimGetTableCommand,
    options?: SimGlueRequestOptions,
  ): simGlueTableCommands.SimGetTableCommandOutput {
    return this.#tableCommands.getTable(command, options);
  }

  /** Read every table in one database. */
  getTables(
    command: simGlueTableCommands.SimGetTablesCommand,
    options?: SimGlueRequestOptions,
  ): simGlueTableCommands.SimGetTablesCommandOutput {
    return this.#tableCommands.getTables(command, options);
  }

  /** Remove a table. */
  deleteTable(
    command: simGlueTableCommands.SimDeleteTableCommand,
    options?: SimGlueRequestOptions,
  ): simGlueTableCommands.SimDeleteTableCommandOutput {
    return this.#tableCommands.deleteTable(command, options);
  }

  /** Route an intercepted SDK Command to this simulated Glue. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }

  /** Get this service's CloudFormation Resource factory. */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.#cfnFactory;
  }
}
