import type {
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
} from "./describe-table.cmd.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../table/dynamodb-table.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";

interface DescribeTableCommandHandlerProps {
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
  readonly background?: BackgroundScheduler;
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
  private readonly background: BackgroundScheduler;

  constructor(props: DescribeTableCommandHandlerProps) {
    const { tables, background = new BackgroundTasks() } = props;
    this.tables = tables;
    this.background = background;
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

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

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
