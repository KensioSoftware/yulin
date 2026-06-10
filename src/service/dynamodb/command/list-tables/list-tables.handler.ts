import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimListTablesCommand,
  SimListTablesCommandOutput,
} from "./list-tables.cmd.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../table/dynamodb-table.js";
import { jitter } from "../../../../util/sleep.js";

interface ListTablesCommandHandlerProps {
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
}

/**
 * Simulated DynamoDB ListTablesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/ListTablesCommand/
 */
export class ListTablesCommandHandler implements CommandHandler<
  SimListTablesCommand,
  SimListTablesCommandOutput
> {
  private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;

  constructor(props: ListTablesCommandHandlerProps) {
    this.tables = props.tables;
  }

  /**
   * Simulate listing DynamoDB Tables.
   */
  async handle(cmd: SimListTablesCommand): Promise<SimListTablesCommandOutput> {
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
      $metadata: {},
    };
  }
}
