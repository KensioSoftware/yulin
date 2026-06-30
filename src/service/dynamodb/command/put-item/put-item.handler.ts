import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandOutput,
} from "./put-item.cmd.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../table/sim-dynamodb-table.js";
import { DynamoDbItem } from "../../item/dynamodb-item.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface PutItemCommandHandlerProps {
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
}

/**
 * DynamoDB PutItemCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/PutItemCommand/
 */
export class PutItemCommandHandler implements CommandHandler<
  SimPutItemCommand,
  SimPutItemCommandOutput
> {
  private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;

  constructor(props: PutItemCommandHandlerProps) {
    this.tables = props.tables;
  }

  /**
   * Put an Item into a DynamoDB Table.
   */
  async handle(cmd: SimPutItemCommand): Promise<SimPutItemCommandOutput> {
    const tableName = cmd.input.TableName as DynamoDbTableName | undefined;
    assertDefined(tableName, "PutItemCommand.input.TableName required");

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new SimDynamoDbResourceNotFoundException(
        `No DynamoDB Table named ${tableName}`,
      );
    }

    assertDefined(cmd.input.Item, "PutItemCommand.input.Item required");

    const item = DynamoDbItem.fromAttributeValues(cmd.input.Item);

    await table.putItem(item);

    return {
      Attributes: item.toAttributeValues(),
      $metadata: {},
    };
  }
}
