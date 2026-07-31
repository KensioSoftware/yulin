import type {
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
} from "./describe-table.command.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { DynamoDbTableName } from "../../table/sim-dynamodb-table-name.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";

interface DescribeTableCommandHandlerProperties {
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
  readonly authorizer: SimDynamoDbAuthorizer;
  readonly background?: BackgroundScheduler;
}

interface DescribeTableCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: SimDynamoDbAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DescribeTableCommandHandlerProperties) {
    const {
      tables,
      authorizer,
      background = new BackgroundTasks(),
    } = properties;
    this.tables = tables;
    this.authorizer = authorizer;
    this.background = background;
  }

  /**
   * Simulate describing DynamoDB Table.
   */
  async handle(
    command: SimDescribeTableCommand,
    options?: DescribeTableCommandHandlerOptions,
  ): Promise<SimDescribeTableCommandOutput> {
    assertDefined(
      command.input.TableName,
      "DescribeTableCommand.input.TableName",
    );
    const tableName = command.input.TableName as DynamoDbTableName;

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeTable(
      "dynamodb:DescribeTable",
      tableName,
      options?.caller,
    );

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
