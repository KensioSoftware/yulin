import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateTableCommand,
  SimDeleteTableCommand,
  SimDescribeTableCommand,
  SimListTablesCommand,
} from "../command/table/table.command.js";
import type {
  SimDeleteItemCommand,
  SimGetItemCommand,
  SimPutItemCommand,
  SimUpdateItemCommand,
} from "../command/item/item.command.js";
import type {
  SimBatchGetItemCommand,
  SimBatchWriteItemCommand,
} from "../command/batch/batch.command.js";
import type {
  SimTransactGetItemsCommand,
  SimTransactWriteItemsCommand,
} from "../command/transact/transact.command.js";
import type { SimDynamoDb as SimDynamoDatabase } from "../sim-dynamodb.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated DynamoDB instance.
 */
export class SimDynamoDatabaseSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simDynamoDatabase: SimDynamoDatabase) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateTableCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.createTable(
            command as SimCreateTableCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeTableCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.describeTable(
            command as SimDescribeTableCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListTablesCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.listTables(
            command as SimListTablesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteTableCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.deleteTable(
            command as SimDeleteTableCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutItemCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.putItem(
            command as SimPutItemCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetItemCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.getItem(
            command as SimGetItemCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateItemCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.updateItem(
            command as SimUpdateItemCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteItemCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.deleteItem(
            command as SimDeleteItemCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "BatchWriteItemCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.batchWriteItem(
            command as SimBatchWriteItemCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "BatchGetItemCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.batchGetItem(
            command as SimBatchGetItemCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "TransactWriteItemsCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.transactWriteItems(
            command as SimTransactWriteItemsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "TransactGetItemsCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.transactGetItems(
            command as SimTransactGetItemsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated DynamoDB can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated DynamoDB supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
