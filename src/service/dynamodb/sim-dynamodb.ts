import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { SimDynamoDbCommandHandlers } from "./command/sim-dynamodb-command-handlers.js";
import type * as simDynamoDbCommands from "./command/sim-dynamodb-command.types.js";
import { SimDynamoDbTableStore } from "./table/sim-dynamodb-table-store.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimIamAllowAllAuth } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimDynamoDatabaseSdkCommandRouter } from "./sdk/sim-dynamodb-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";
import { SimDynamoDbCfnResourceFactory } from "./cfn/sim-cfn-dynamodb-resource-factory.js";
import type { SimDynamoDbTable } from "./table/sim-dynamodb-table.js";
import type {
  SimDynamoDbProperties,
  SimDynamoDbRequestOptions,
} from "./sim-dynamodb.types.js";

/**
 * Simulated DynamoDB. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimDynamoDb {
  private readonly tables = new SimDynamoDbTableStore();
  private readonly background: BackgroundScheduler;
  private readonly commands: SimDynamoDbCommandHandlers;
  private readonly sdkRouter = new SimDynamoDatabaseSdkCommandRouter(this);
  private readonly cfnFactory = new SimDynamoDbCfnResourceFactory({
    dynamoDb: this,
  });

  constructor(properties: SimDynamoDbProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.background = background;
    this.commands = new SimDynamoDbCommandHandlers({
      tables: this.tables,
      accountRegionScope,
      iam,
      background,
    });
  }

  /**
   * Handle a Create Table Command from the SDK.
   */
  async createTable(
    command: simDynamoDbCommands.SimCreateTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimCreateTableCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();
    return this.commands.tableCreation.handle(command, options);
  }

  /**
   * Handle a Describe Table Command from the SDK.
   */
  async describeTable(
    command: simDynamoDbCommands.SimDescribeTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimDescribeTableCommandOutput> {
    await this.background.sequence();
    return this.commands.tables.describeTable(command, options);
  }

  /**
   * Handle an Update Table Command from the SDK.
   */
  async updateTable(
    command: simDynamoDbCommands.SimUpdateTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimUpdateTableCommandOutput> {
    await this.background.sequence();
    return this.commands.tableUpdates.handle(command, options);
  }

  /**
   * Handle a List Tables Command from the SDK.
   */
  async listTables(
    command: simDynamoDbCommands.SimListTablesCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimListTablesCommandOutput> {
    await this.background.sequence();
    return this.commands.tables.listTables(command, options);
  }

  /**
   * Handle a Delete Table Command from the SDK.
   */
  async deleteTable(
    command: simDynamoDbCommands.SimDeleteTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimDeleteTableCommandOutput> {
    await this.background.sequence();
    return this.commands.tables.deleteTable(command, options);
  }

  /**
   * Handle a Put Item Command from the SDK.
   */
  async putItem(
    command: simDynamoDbCommands.SimPutItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimPutItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemWrites.handle(command, options);
  }

  /**
   * Handle a Get Item Command from the SDK.
   */
  async getItem(
    command: simDynamoDbCommands.SimGetItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimGetItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemReads.handle(command, options);
  }

  /**
   * Handle a Delete Item Command from the SDK.
   */
  async deleteItem(
    command: simDynamoDbCommands.SimDeleteItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimDeleteItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemDeletions.handle(command, options);
  }

  /**
   * Handle an Update Item Command from the SDK.
   */
  async updateItem(
    command: simDynamoDbCommands.SimUpdateItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimUpdateItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemUpdates.handle(command, options);
  }

  /**
   * Handle a Query Command from the SDK.
   */
  async query(
    command: simDynamoDbCommands.SimQueryCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimQueryCommandOutput> {
    await this.background.sequence();
    return this.commands.itemQueries.handle(command, options);
  }

  /**
   * Handle a Scan Command from the SDK.
   */
  async scan(
    command: simDynamoDbCommands.SimScanCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimScanCommandOutput> {
    await this.background.sequence();
    return this.commands.itemScans.handle(command, options);
  }

  /**
   * Handle a Batch Write Item Command from the SDK.
   */
  async batchWriteItem(
    command: simDynamoDbCommands.SimBatchWriteItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimBatchWriteItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemBatchWrites.handle(command, options);
  }

  /**
   * Handle a Batch Get Item Command from the SDK.
   */
  async batchGetItem(
    command: simDynamoDbCommands.SimBatchGetItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimBatchGetItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemBatchReads.handle(command, options);
  }

  /**
   * Handle a Transact Write Items Command from the SDK.
   */
  async transactWriteItems(
    command: simDynamoDbCommands.SimTransactWriteItemsCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimTransactWriteItemsCommandOutput> {
    await this.background.sequence();
    return this.commands.itemTransactWrites.handle(command, options);
  }

  /**
   * Handle a Transact Get Items Command from the SDK.
   */
  async transactGetItems(
    command: simDynamoDbCommands.SimTransactGetItemsCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimTransactGetItemsCommandOutput> {
    await this.background.sequence();
    return this.commands.itemTransactReads.handle(command, options);
  }

  /**
   * Handle a Tag Resource Command from the SDK.
   */
  async tagResource(
    command: simDynamoDbCommands.SimTagResourceCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimTagResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.tagResource(command, options);
  }

  /**
   * Handle an Untag Resource Command from the SDK.
   */
  async untagResource(
    command: simDynamoDbCommands.SimUntagResourceCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimUntagResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.untagResource(command, options);
  }

  /**
   * Handle a List Tags Of Resource Command from the SDK.
   */
  async listTagsOfResource(
    command: simDynamoDbCommands.SimListTagsOfResourceCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimListTagsOfResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.listTagsOfResource(command, options);
  }

  /**
   * Handle an Update Time To Live Command from the SDK.
   */
  async updateTimeToLive(
    command: simDynamoDbCommands.SimUpdateTimeToLiveCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimUpdateTimeToLiveCommandOutput> {
    await this.background.sequence();
    return this.commands.timeToLive.updateTimeToLive(command, options);
  }

  /**
   * Handle a Describe Time To Live Command from the SDK.
   */
  async describeTimeToLive(
    command: simDynamoDbCommands.SimDescribeTimeToLiveCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<simDynamoDbCommands.SimDescribeTimeToLiveCommandOutput> {
    await this.background.sequence();
    return this.commands.timeToLive.describeTimeToLive(command, options);
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
