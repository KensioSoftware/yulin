import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandOutput,
} from "./put-item.command.js";
import { DynamoDbItem as DynamoDatabaseItem } from "../../item/dynamodb-item.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";

interface PutItemCommandHandlerProperties {
  readonly access: SimDynamoDbTableAccess;
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
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: PutItemCommandHandlerProperties) {
    this.access = properties.access;
  }

  /**
   * Put an Item into a DynamoDB Table.
   */
  async handle(
    command: SimPutItemCommand,
    options?: PutItemCommandHandlerOptions,
  ): Promise<SimPutItemCommandOutput> {
    const table = this.access.required(
      "dynamodb:PutItem",
      command.input.TableName,
      options?.caller,
    );

    assertDefined(command.input.Item, "PutItemCommand.input.Item required");

    const item = DynamoDatabaseItem.fromAttributeValues(command.input.Item);

    await table.putItem(item);

    return {
      Attributes: item.toAttributeValues(),
      $metadata: {},
    };
  }
}
