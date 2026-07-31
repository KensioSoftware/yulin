import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandOutput,
} from "./put-item.command.js";
import { SimDynamoDbTableName } from "../../table/sim-dynamodb-table-name.js";
import type { SimDynamoDbTableStore } from "../../table/sim-dynamodb-table-store.js";
import { DynamoDbItem as DynamoDatabaseItem } from "../../item/dynamodb-item.js";
import { SimDynamoDbResourceNotFoundException as SimDynamoDatabaseResourceNotFoundException } from "../../error/dynamodb.error.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";

interface PutItemCommandHandlerProperties {
  readonly tables: SimDynamoDbTableStore;
  readonly authorizer: SimDynamoDbAuthorizer;
}

interface PutItemCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly tables: SimDynamoDbTableStore;
  private readonly authorizer: SimDynamoDbAuthorizer;

  constructor(properties: PutItemCommandHandlerProperties) {
    this.tables = properties.tables;
    this.authorizer = properties.authorizer;
  }

  /**
   * Put an Item into a DynamoDB Table.
   */
  async handle(
    command: SimPutItemCommand,
    options?: PutItemCommandHandlerOptions,
  ): Promise<SimPutItemCommandOutput> {
    assertDefined(
      command.input.TableName,
      "PutItemCommand.input.TableName required",
    );
    const tableName = SimDynamoDbTableName.of(command.input.TableName);

    this.authorizer.authorizeTable(
      "dynamodb:PutItem",
      tableName.value,
      options?.caller,
    );

    const table = this.tables.find(tableName);
    if (table === undefined) {
      throw new SimDynamoDatabaseResourceNotFoundException(
        `No DynamoDB Table named ${tableName.value}`,
      );
    }

    assertDefined(command.input.Item, "PutItemCommand.input.Item required");

    const item = DynamoDatabaseItem.fromAttributeValues(command.input.Item);

    await table.putItem(item);

    return {
      Attributes: item.toAttributeValues(),
      $metadata: {},
    };
  }
}
