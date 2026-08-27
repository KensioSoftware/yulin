import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import { SimGlueAuthorizer } from "./command/authorize/sim-glue-authorizer.js";
import { SimGlueDatabaseCommands } from "./command/database/sim-glue-database-commands.js";
import type * as simGlueCommands from "./command/database/database.command.js";
import type * as simGlueTableCommands from "./command/table/table.command.js";
import type * as simGluePartitionCommands from "./command/partition/partition.command.js";
import { SimGlueTableCommands } from "./command/table/sim-glue-table-commands.js";
import { SimGluePartitionCommands } from "./command/partition/sim-glue-partition-commands.js";
import { SimGluePartitionRegistry } from "./command/partition/sim-glue-partition-registry.js";
import type { SimGlueRequestOptions } from "./command/sim-glue-request-options.js";
import { SimGlueDatabaseStore } from "./database/sim-glue-database-store.js";
import type { SimGlueDatabase } from "./database/sim-glue-database.js";
import { SimGlueCfnResourceFactory } from "./cfn/sim-glue-cfn-resource-factory.js";
import { SimGlueSdkCommandRouter } from "./sdk/sim-glue-sdk-command-router.js";
import { SimGluePartitionStore } from "./partition/sim-glue-partition-store.js";
import type { SimGluePartition } from "./partition/sim-glue-partition.js";
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
  readonly #partitions: SimGluePartitionStore;
  readonly #databaseCommands: SimGlueDatabaseCommands;
  readonly #tableCommands: SimGlueTableCommands;
  readonly #partitionCommands: SimGluePartitionCommands;
  readonly #catalogWriter: SimGlueCatalogWriter;

  readonly #sdkRouter = new SimGlueSdkCommandRouter(this);
  readonly #cfnFactory: SimGlueCfnResourceFactory;

  constructor(properties: SimGlueProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);

    const authorizer = new SimGlueAuthorizer({ iam, accountRegionScope });

    this.#databases = new SimGlueDatabaseStore({ accountRegionScope });
    this.#tables = new SimGlueTableStore({ accountRegionScope });
    this.#partitions = new SimGluePartitionStore({ accountRegionScope });

    const collaborators = {
      databases: this.#databases,
      tables: this.#tables,
      partitions: this.#partitions,
      authorizer,
      accountRegionScope,
      clock: background,
    };

    this.#databaseCommands = new SimGlueDatabaseCommands(collaborators);
    this.#tableCommands = new SimGlueTableCommands(collaborators);
    this.#partitionCommands = new SimGluePartitionCommands({
      registry: new SimGluePartitionRegistry(collaborators),
    });
    this.#catalogWriter = new SimGlueCatalogWriter({
      databases: this.#databases,
      tables: this.#tables,
      partitions: this.#partitions,
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

  /**
   * Find a partition by its table and its values, without going through a
   * Command.
   */
  findPartition(
    databaseName: string,
    tableName: string,
    values: readonly string[],
  ): SimGluePartition | undefined {
    return this.#partitions.inTable(databaseName, tableName).find(values);
  }

  /** Every partition registered against one table, in registration order. */
  partitionsInTable(
    databaseName: string,
    tableName: string,
  ): readonly SimGluePartition[] {
    return this.#partitions.inTable(databaseName, tableName).all;
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

  /** Remove a table, and the partitions registered against it with it. */
  deleteTable(
    command: simGlueTableCommands.SimDeleteTableCommand,
    options?: SimGlueRequestOptions,
  ): simGlueTableCommands.SimDeleteTableCommandOutput {
    return this.#tableCommands.deleteTable(command, options);
  }

  /** Register one partition against a table. */
  createPartition(
    command: simGluePartitionCommands.SimCreatePartitionCommand,
    options?: SimGlueRequestOptions,
  ): simGluePartitionCommands.SimCreatePartitionCommandOutput {
    return this.#partitionCommands.createPartition(command, options);
  }

  /** Register several partitions at once. */
  batchCreatePartition(
    command: simGluePartitionCommands.SimBatchCreatePartitionCommand,
    options?: SimGlueRequestOptions,
  ): simGluePartitionCommands.SimBatchCreatePartitionCommandOutput {
    return this.#partitionCommands.batchCreatePartition(command, options);
  }

  /** Read one partition back by its values. */
  getPartition(
    command: simGluePartitionCommands.SimGetPartitionCommand,
    options?: SimGlueRequestOptions,
  ): simGluePartitionCommands.SimGetPartitionCommandOutput {
    return this.#partitionCommands.getPartition(command, options);
  }

  /** Read every partition registered against one table. */
  getPartitions(
    command: simGluePartitionCommands.SimGetPartitionsCommand,
    options?: SimGlueRequestOptions,
  ): simGluePartitionCommands.SimGetPartitionsCommandOutput {
    return this.#partitionCommands.getPartitions(command, options);
  }

  /** Remove one partition. */
  deletePartition(
    command: simGluePartitionCommands.SimDeletePartitionCommand,
    options?: SimGlueRequestOptions,
  ): simGluePartitionCommands.SimDeletePartitionCommandOutput {
    return this.#partitionCommands.deletePartition(command, options);
  }

  /** Remove several partitions at once. */
  batchDeletePartition(
    command: simGluePartitionCommands.SimBatchDeletePartitionCommand,
    options?: SimGlueRequestOptions,
  ): simGluePartitionCommands.SimBatchDeletePartitionCommandOutput {
    return this.#partitionCommands.batchDeletePartition(command, options);
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
