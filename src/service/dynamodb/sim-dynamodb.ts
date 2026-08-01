import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbAuthorizer } from "./command/authorize/sim-dynamodb-authorizer.js";
import { SimDynamoDbBatchGetItem } from "./command/batch/sim-dynamodb-batch-get-item.js";
import { SimDynamoDbBatchWriteItem } from "./command/batch/sim-dynamodb-batch-write-item.js";
import { SimDynamoDbDeleteItem } from "./command/item/sim-dynamodb-delete-item.js";
import { SimDynamoDbGetItem } from "./command/item/sim-dynamodb-get-item.js";
import { SimDynamoDbPutItem } from "./command/item/sim-dynamodb-put-item.js";
import { SimDynamoDbUpdateItem } from "./command/item/sim-dynamodb-update-item.js";
import { SimDynamoDbCreateTable } from "./command/table/sim-dynamodb-create-table.js";
import { SimDynamoDbTableAccess } from "./command/table/sim-dynamodb-table-access.js";
import { SimDynamoDbTableCommands } from "./command/table/sim-dynamodb-table-commands.js";
import { SimDynamoDbTableStore } from "./table/sim-dynamodb-table-store.js";
import type {
  SimCreateTableCommand,
  SimCreateTableCommandOutput,
  SimDeleteTableCommand,
  SimDeleteTableCommandOutput,
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
  SimListTablesCommand,
  SimListTablesCommandOutput,
} from "./command/table/table.command.js";
import type {
  SimDeleteItemCommand,
  SimDeleteItemCommandOutput,
  SimGetItemCommand,
  SimGetItemCommandOutput,
  SimPutItemCommand,
  SimPutItemCommandOutput,
  SimUpdateItemCommand,
  SimUpdateItemCommandOutput,
} from "./command/item/item.command.js";
import type {
  SimBatchGetItemCommand,
  SimBatchGetItemCommandOutput,
  SimBatchWriteItemCommand,
  SimBatchWriteItemCommandOutput,
} from "./command/batch/batch.command.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimDynamoDatabaseSdkCommandRouter } from "./sdk/sim-dynamodb-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";
import { SimDynamoDbCfnResourceFactory } from "./cfn/sim-cfn-dynamodb-resource-factory.js";
import type { SimDynamoDbTable } from "./table/sim-dynamodb-table.js";

export interface SimDynamoDbRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimDynamoDatabaseProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated DynamoDB. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimDynamoDb {
  private readonly tables = new SimDynamoDbTableStore();

  private readonly access: SimDynamoDbTableAccess;
  private readonly background: BackgroundScheduler;
  private readonly tableCreation: SimDynamoDbCreateTable;
  private readonly tableCommands: SimDynamoDbTableCommands;
  private readonly itemWrites: SimDynamoDbPutItem;
  private readonly itemReads: SimDynamoDbGetItem;
  private readonly itemDeletions: SimDynamoDbDeleteItem;
  private readonly itemUpdates: SimDynamoDbUpdateItem;
  private readonly itemBatchWrites: SimDynamoDbBatchWriteItem;
  private readonly itemBatchReads: SimDynamoDbBatchGetItem;
  private readonly sdkRouter = new SimDynamoDatabaseSdkCommandRouter(this);
  private readonly cfnFactory = new SimDynamoDbCfnResourceFactory({
    dynamoDb: this,
  });

  constructor(properties: SimDynamoDatabaseProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimDynamoDbAuthorizer({ iam, accountRegionScope });

    this.background = background;
    this.access = new SimDynamoDbTableAccess({
      tables: this.tables,
      authorizer,
      accountRegionScope,
    });
    this.tableCreation = new SimDynamoDbCreateTable({
      tables: this.tables,
      authorizer,
      accountRegionScope,
      background,
    });
    this.tableCommands = new SimDynamoDbTableCommands({
      tables: this.tables,
      access: this.access,
      background,
    });
    this.itemWrites = new SimDynamoDbPutItem({ access: this.access });
    this.itemReads = new SimDynamoDbGetItem({ access: this.access });
    this.itemDeletions = new SimDynamoDbDeleteItem({ access: this.access });
    this.itemUpdates = new SimDynamoDbUpdateItem({ access: this.access });
    this.itemBatchWrites = new SimDynamoDbBatchWriteItem({
      access: this.access,
    });
    this.itemBatchReads = new SimDynamoDbBatchGetItem({ access: this.access });
  }

  /**
   * Handle a Create Table Command from the SDK.
   */
  async createTable(
    command: SimCreateTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimCreateTableCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();
    return this.tableCreation.handle(command, options);
  }

  /**
   * Handle a Describe Table Command from the SDK.
   */
  async describeTable(
    command: SimDescribeTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimDescribeTableCommandOutput> {
    await this.background.sequence();
    return this.tableCommands.describeTable(command, options);
  }

  /**
   * Handle a List Tables Command from the SDK.
   */
  async listTables(
    command: SimListTablesCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimListTablesCommandOutput> {
    await this.background.sequence();
    return this.tableCommands.listTables(command, options);
  }

  /**
   * Handle a Delete Table Command from the SDK.
   */
  async deleteTable(
    command: SimDeleteTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimDeleteTableCommandOutput> {
    await this.background.sequence();
    return this.tableCommands.deleteTable(command, options);
  }

  /**
   * Handle a Put Item Command from the SDK.
   */
  async putItem(
    command: SimPutItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimPutItemCommandOutput> {
    await this.background.sequence();
    return this.itemWrites.handle(command, options);
  }

  /**
   * Handle a Get Item Command from the SDK.
   */
  async getItem(
    command: SimGetItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimGetItemCommandOutput> {
    await this.background.sequence();
    return this.itemReads.handle(command, options);
  }

  /**
   * Handle a Delete Item Command from the SDK.
   */
  async deleteItem(
    command: SimDeleteItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimDeleteItemCommandOutput> {
    await this.background.sequence();
    return this.itemDeletions.handle(command, options);
  }

  /**
   * Handle an Update Item Command from the SDK.
   */
  async updateItem(
    command: SimUpdateItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimUpdateItemCommandOutput> {
    await this.background.sequence();
    return this.itemUpdates.handle(command, options);
  }

  /**
   * Handle a Batch Write Item Command from the SDK.
   */
  async batchWriteItem(
    command: SimBatchWriteItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimBatchWriteItemCommandOutput> {
    await this.background.sequence();
    return this.itemBatchWrites.handle(command, options);
  }

  /**
   * Handle a Batch Get Item Command from the SDK.
   */
  async batchGetItem(
    command: SimBatchGetItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimBatchGetItemCommandOutput> {
    await this.background.sequence();
    return this.itemBatchReads.handle(command, options);
  }

  /**
   * Find a table by name, if there is one here.
   *
   * Not a DynamoDB API operation. It reads the simulated state directly, for
   * the parts of the simulator that hold a table rather than describe one, such
   * as CloudFormation after it has created one. A name real DynamoDB would
   * refuse belongs to no table, so it is not found rather than an error.
   */
  findTable(name: string): SimDynamoDbTable | undefined {
    return this.tables.findByName(name);
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimDynamoDbCfnResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
