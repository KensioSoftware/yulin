import type { DynamoDbTableName } from "../../dynamodb-table.js";
import { SimDynamoDbTable } from "../../dynamodb-table.js";
import {
  type CreateTableCommand,
  type CreateTableCommandOutput,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import { jitter } from "../../../../util/sleep.js";

/**
 * DynamoDB CreateTableCommand handler.
 */
export class CreateTableCommandHandler implements CommandHandler<
  CreateTableCommand,
  CreateTableCommandOutput
> {
  constructor(
    private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>,
    private readonly background: BackgroundScheduler,
  ) {}

  /**
   * Handle creation of a new DynamoDB Table.
   */
  async handle(cmd: CreateTableCommand): Promise<CreateTableCommandOutput> {
    if (cmd.input.TableName === undefined) {
      throw new Error("CreateTableCommand.input.TableName is required");
    }

    const tableName = cmd.input.TableName as DynamoDbTableName;
    if (this.tables.has(tableName)) {
      throw new ResourceInUseException({
        message: `DynamoDB Table ${tableName} already exists`,
        $metadata: {},
      });
    }

    await jitter();

    const table = new SimDynamoDbTable(cmd);
    this.tables.set(tableName, table);

    this.background.schedule(() => table.activate());

    return {
      TableDescription: {
        AttributeDefinitions: [],
        TableName: tableName,
        KeySchema: [],
        TableStatus: table.status,
        CreationDateTime: table.creationDateTime,
        GlobalSecondaryIndexes: [],
      },
      $metadata: {},
    };
  }
}
