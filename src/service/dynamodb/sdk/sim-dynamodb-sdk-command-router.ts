import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreateTableCommand } from "../command/table/table.command.js";
import type { SimDescribeTableCommand } from "../command/describe-table/describe-table.command.js";
import type { SimListTablesCommand } from "../command/list-tables/list-tables.command.js";
import type { SimPutItemCommand } from "../command/put-item/put-item.command.js";
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
        "PutItemCommand",
        async (command, context): Promise<unknown> =>
          await simDynamoDatabase.putItem(
            command as SimPutItemCommand,
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
