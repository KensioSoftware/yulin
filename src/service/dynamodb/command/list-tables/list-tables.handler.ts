import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimListTablesCommand,
  SimListTablesCommandOutput,
} from "./list-tables.command.js";
import type { SimDynamoDbTable as SimDynamoDatabaseTable } from "../../table/sim-dynamodb-table.js";
import type { DynamoDbTableName as DynamoDatabaseTableName } from "../../table/sim-dynamodb-table-name.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";

interface ListTablesCommandHandlerProperties {
  readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
  readonly authorizer: SimDynamoDbAuthorizer;
  readonly background?: BackgroundScheduler;
}

interface ListTablesCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
  private readonly authorizer: SimDynamoDbAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListTablesCommandHandlerProperties) {
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
   * Simulate listing DynamoDB Tables.
   */
  async handle(
    command: SimListTablesCommand,
    options?: ListTablesCommandHandlerOptions,
  ): Promise<SimListTablesCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeAnyTable("dynamodb:ListTables", options?.caller);

    const tables = this.tables.values().toArray();
    tables.sort((a, b) => a.tableName.localeCompare(b.tableName));

    const exclusiveStartTableName = command.input.ExclusiveStartTableName;
    const limit = command.input.Limit ?? 100;

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
