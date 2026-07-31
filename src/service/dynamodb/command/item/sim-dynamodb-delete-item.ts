import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimDeleteItemCommand,
  SimDeleteItemCommandOutput,
} from "./item.command.js";
import { readSimDynamoDbKey } from "./sim-dynamodb-key-input.js";
import { SimDynamoDbReturnValues } from "./sim-dynamodb-return-values.js";
import { refuseUnsimulatedItemWriteInput } from "./sim-dynamodb-unsimulated-item-write-input.js";

interface SimDynamoDbDeleteItemProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbDeleteItemOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The DeleteItem command.
 *
 * DeleteItem names a key rather than an item, so deleting a key that holds
 * nothing succeeds and reports nothing removed. The item is gone by the time
 * the call returns, so a read that follows it misses.
 */
export class SimDynamoDbDeleteItem {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbDeleteItemProperties) {
    this.access = properties.access;
  }

  /**
   * Remove an item, and answer with the item that was removed when asked to.
   */
  handle(
    command: SimDeleteItemCommand,
    options?: SimDynamoDbDeleteItemOptions,
  ): SimDeleteItemCommandOutput {
    const input = command.input;

    refuseUnsimulatedItemWriteInput(input, "DeleteItem");

    const table = this.access.required(
      "dynamodb:DeleteItem",
      input.TableName,
      options?.caller,
    );
    const asked = SimDynamoDbReturnValues.read(
      input.ReturnValues,
      "DeleteItem",
    );
    const removed = table.deleteItem(readSimDynamoDbKey(input.Key));

    if (!asked.wantsOldItem() || removed === undefined) {
      return { $metadata: {} };
    }

    return { Attributes: removed.toAttributeValues(), $metadata: {} };
  }
}
