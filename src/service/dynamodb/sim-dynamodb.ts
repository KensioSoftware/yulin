import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbCommandHandlers } from "./command/sim-dynamodb-command-handlers.js";
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
import type {
  SimTransactGetItemsCommand,
  SimTransactGetItemsCommandOutput,
  SimTransactWriteItemsCommand,
  SimTransactWriteItemsCommandOutput,
} from "./command/transact/transact.command.js";
import type {
  SimListTagsOfResourceCommand,
  SimListTagsOfResourceCommandOutput,
  SimTagResourceCommand,
  SimTagResourceCommandOutput,
  SimUntagResourceCommand,
  SimUntagResourceCommandOutput,
} from "./command/tag/tag.command.js";
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
  private readonly background: BackgroundScheduler;
  private readonly commands: SimDynamoDbCommandHandlers;
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
    command: SimCreateTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimCreateTableCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();
    return this.commands.tableCreation.handle(command, options);
  }

  /**
   * Handle a Describe Table Command from the SDK.
   */
  async describeTable(
    command: SimDescribeTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimDescribeTableCommandOutput> {
    await this.background.sequence();
    return this.commands.tables.describeTable(command, options);
  }

  /**
   * Handle a List Tables Command from the SDK.
   */
  async listTables(
    command: SimListTablesCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimListTablesCommandOutput> {
    await this.background.sequence();
    return this.commands.tables.listTables(command, options);
  }

  /**
   * Handle a Delete Table Command from the SDK.
   */
  async deleteTable(
    command: SimDeleteTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimDeleteTableCommandOutput> {
    await this.background.sequence();
    return this.commands.tables.deleteTable(command, options);
  }

  /**
   * Handle a Put Item Command from the SDK.
   */
  async putItem(
    command: SimPutItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimPutItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemWrites.handle(command, options);
  }

  /**
   * Handle a Get Item Command from the SDK.
   */
  async getItem(
    command: SimGetItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimGetItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemReads.handle(command, options);
  }

  /**
   * Handle a Delete Item Command from the SDK.
   */
  async deleteItem(
    command: SimDeleteItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimDeleteItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemDeletions.handle(command, options);
  }

  /**
   * Handle an Update Item Command from the SDK.
   */
  async updateItem(
    command: SimUpdateItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimUpdateItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemUpdates.handle(command, options);
  }

  /**
   * Handle a Batch Write Item Command from the SDK.
   */
  async batchWriteItem(
    command: SimBatchWriteItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimBatchWriteItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemBatchWrites.handle(command, options);
  }

  /**
   * Handle a Batch Get Item Command from the SDK.
   */
  async batchGetItem(
    command: SimBatchGetItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimBatchGetItemCommandOutput> {
    await this.background.sequence();
    return this.commands.itemBatchReads.handle(command, options);
  }

  /**
   * Handle a Transact Write Items Command from the SDK.
   */
  async transactWriteItems(
    command: SimTransactWriteItemsCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimTransactWriteItemsCommandOutput> {
    await this.background.sequence();
    return this.commands.itemTransactWrites.handle(command, options);
  }

  /**
   * Handle a Transact Get Items Command from the SDK.
   */
  async transactGetItems(
    command: SimTransactGetItemsCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimTransactGetItemsCommandOutput> {
    await this.background.sequence();
    return this.commands.itemTransactReads.handle(command, options);
  }

  /**
   * Handle a Tag Resource Command from the SDK.
   */
  async tagResource(
    command: SimTagResourceCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimTagResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.tagResource(command, options);
  }

  /**
   * Handle an Untag Resource Command from the SDK.
   */
  async untagResource(
    command: SimUntagResourceCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimUntagResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.untagResource(command, options);
  }

  /**
   * Handle a List Tags Of Resource Command from the SDK.
   */
  async listTagsOfResource(
    command: SimListTagsOfResourceCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimListTagsOfResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.listTagsOfResource(command, options);
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
