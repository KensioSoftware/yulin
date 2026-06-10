import type {
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
} from "./describe-table.cmd.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../table/dynamodb-table.js";
import { jitter } from "../../../../util/sleep.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";

interface DescribeTableCommandHandlerProps {
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
}

/**
 * DynamoDB DescribeTableCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/DescribeTableCommand/
 */
export class DescribeTableCommandHandler implements CommandHandler<
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput
> {
  private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;

  constructor(props: DescribeTableCommandHandlerProps) {
    this.tables = props.tables;
  }

  /**
   * Simulate describing DynamoDB Table.
   */
  async handle(
    cmd: SimDescribeTableCommand,
  ): Promise<SimDescribeTableCommandOutput> {
    if (cmd.input.TableName === undefined) {
      throw new Error("DescribeTableCommand.input.TableName is required");
    }
    const tableName = cmd.input.TableName as DynamoDbTableName;

    await jitter();

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new SimDynamoDbResourceNotFoundException(
        `No DynamoDB Table named ${tableName}`,
      );
    }

    return {
      Table: {
        TableName: table.tableName,
        TableStatus: table.status,
      },
      $metadata: {},
    };
  }
}
