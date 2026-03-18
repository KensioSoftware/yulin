import {
  ResourceNotFoundException,
  type DescribeTableCommand,
  type DescribeTableOutput,
} from "@aws-sdk/client-dynamodb";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../dynamodb-table.js";
import { jitter } from "../../../../util/sleep.js";

/**
 * DynamoDB DescribeTableCommand handler.
 */
export class DescribeTableCommandHandler implements CommandHandler<
  DescribeTableCommand,
  DescribeTableOutput
> {
  constructor(
    private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>,
  ) {}

  /**
   * Simulate describing DynamoDB Table.
   */
  async handle(cmd: DescribeTableCommand): Promise<DescribeTableOutput> {
    if (cmd.input.TableName === undefined) {
      throw new Error("DescribeTableCommand.input.TableName is required");
    }
    const tableName = cmd.input.TableName as DynamoDbTableName;

    await jitter();

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new ResourceNotFoundException({
        message: `No DynamoDB Table named ${tableName}`,
        $metadata: {},
      });
    }

    return {
      Table: {
        TableName: table.tableName,
        TableStatus: table.status,
      },
    };
  }
}
