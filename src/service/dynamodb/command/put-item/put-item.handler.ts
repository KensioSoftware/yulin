import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandOutput,
} from "./put-item.command.js";
import type { SimDynamoDbTable as SimDynamoDatabaseTable } from "../../table/sim-dynamodb-table.js";
import type { DynamoDbTableName as DynamoDatabaseTableName } from "../../table/sim-dynamodb-table-name.js";
import { DynamoDbItem as DynamoDatabaseItem } from "../../item/dynamodb-item.js";
import { SimDynamoDbResourceNotFoundException as SimDynamoDatabaseResourceNotFoundException } from "../../error/dynamodb.error.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";

interface PutItemCommandHandlerProperties {
  readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
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
  private readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
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
    const tableName = command.input.TableName as
      DynamoDatabaseTableName | undefined;
    assertDefined(tableName, "PutItemCommand.input.TableName required");

    this.authorizer.authorizeTable(
      "dynamodb:PutItem",
      tableName,
      options?.caller,
    );

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new SimDynamoDatabaseResourceNotFoundException(
        `No DynamoDB Table named ${tableName}`,
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
