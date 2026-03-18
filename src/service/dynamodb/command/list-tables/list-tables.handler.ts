import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  ListTablesCommand,
  ListTablesOutput,
} from "@aws-sdk/client-dynamodb";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../dynamodb-table.js";
import { jitter } from "../../../../util/sleep.js";

/**
 * Simulated DynamoDB ListTablesCommand handler.
 */
export class ListTablesCommandHandler implements CommandHandler<
  ListTablesCommand,
  ListTablesOutput
> {
  constructor(
    private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>,
  ) {}

  /**
   * Simulate listing DynamoDB Tables.
   */
  async handle(cmd: ListTablesCommand): Promise<ListTablesOutput> {
    await jitter();

    const tables = [...this.tables.values()];
    tables.sort((a, b) => a.tableName.localeCompare(b.tableName));

    const exclusiveStartTableName = cmd.input.ExclusiveStartTableName;
    const limit = cmd.input.Limit ?? 100;

    const startIndex =
      exclusiveStartTableName === undefined
        ? 0
        : Math.max(
            0,
            tables.findIndex((t) => t.tableName === exclusiveStartTableName) +
              1,
          );

    const page = tables.slice(startIndex, startIndex + limit);

    return {
      TableNames: page.map((table) => table.tableName),
      LastEvaluatedTableName: page.at(-1)?.tableName,
    };
  }
}
