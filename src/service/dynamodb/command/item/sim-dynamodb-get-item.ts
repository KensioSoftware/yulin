import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimGetItemCommand,
  SimGetItemCommandOutput,
} from "./item.command.js";
import { readSimDynamoDbKey } from "./sim-dynamodb-key-input.js";
import { refuseUnsimulatedItemReadInput } from "./sim-dynamodb-unsimulated-item-read-input.js";
import { readSimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection-expression.js";

interface SimDynamoDbGetItemProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbGetItemOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The GetItem command.
 *
 * A read here is always the latest write, whether or not `ConsistentRead` asks
 * for one. Nothing about a write is scheduled, so there is no window in which
 * an eventually consistent read could answer with something older.
 */
export class SimDynamoDbGetItem {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbGetItemProperties) {
    this.access = properties.access;
  }

  /**
   * Read the item a primary key names.
   *
   * A key holding nothing answers with no `Item` at all rather than an empty
   * one, which is how a caller tells a miss from an item carrying nothing but
   * its key.
   */
  handle(
    command: SimGetItemCommand,
    options?: SimDynamoDbGetItemOptions,
  ): SimGetItemCommandOutput {
    const input = command.input;

    refuseUnsimulatedItemReadInput(input);

    // The projection is read before the table is reached, so an expression
    // DynamoDB would refuse is refused whether or not the key holds anything.
    const projection = readSimDynamoDbProjection(input);
    const table = this.access.required(
      "dynamodb:GetItem",
      input.TableName,
      options?.caller,
    );
    const found = table.getItem(readSimDynamoDbKey(input.Key));

    if (found === undefined) {
      return { $metadata: {} };
    }

    // A projection that found none of what it asked for leaves an item with no
    // attributes, which is answered with as an empty Item rather than as a
    // miss: the key was there, and nothing the request asked for was.
    const projected = projection?.apply(found) ?? found;

    return { Item: projected.toAttributeValues(), $metadata: {} };
  }
}
