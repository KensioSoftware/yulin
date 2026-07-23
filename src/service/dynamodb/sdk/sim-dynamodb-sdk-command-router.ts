import type {
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreateTableCommand } from "../command/create-table/create-table.cmd.js";
import type { SimDescribeTableCommand } from "../command/describe-table/describe-table.cmd.js";
import type { SimListTablesCommand } from "../command/list-tables/list-tables.cmd.js";
import type { SimPutItemCommand } from "../command/put-item/put-item.cmd.js";
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
        async (command): Promise<unknown> =>
          await simDynamoDatabase.createTable(command as SimCreateTableCommand),
      ],
      [
        "DescribeTableCommand",
        async (command): Promise<unknown> =>
          await simDynamoDatabase.describeTable(
            command as SimDescribeTableCommand,
          ),
      ],
      [
        "ListTablesCommand",
        async (command): Promise<unknown> =>
          await simDynamoDatabase.listTables(command as SimListTablesCommand),
      ],
      [
        "PutItemCommand",
        async (command): Promise<unknown> =>
          await simDynamoDatabase.putItem(command as SimPutItemCommand),
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
