import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type PutItemCommand,
  type PutItemCommandOutput,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../table/dynamodb-table.js";
import { DynamoDbItem } from "../../item/dynamodb-item.js";

/**
 * DynamoDB PutItemCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/PutItemCommand/
 */
export class PutItemCommandHandler implements CommandHandler<
  PutItemCommand,
  PutItemCommandOutput
> {
  constructor(
    private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>,
  ) {}

  /**
   * Put an Item into a DynamoDB Table.
   */
  async handle(cmd: PutItemCommand): Promise<PutItemCommandOutput> {
    const tableName = cmd.input.TableName as DynamoDbTableName | undefined;
    if (tableName === undefined) {
      throw new Error("PutItemCommand.input.TableName is required");
    }

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new ResourceNotFoundException({
        message: `No DynamoDB Table named ${tableName}`,
        $metadata: {},
      });
    }

    if (cmd.input.Item === undefined) {
      throw new Error("PutItemCommand.input.Item is required");
    }

    const item = DynamoDbItem.fromAttributeValues(cmd.input.Item);

    await table.putItem(item);

    return {
      Attributes: item.toAttributeValues(),
      $metadata: {},
    };
  }
}
