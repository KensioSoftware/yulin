import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandInput,
  SimPutItemCommandOutput,
} from "./item.command.js";
import { SimDynamoDbConditionCheck } from "./sim-dynamodb-condition-check.js";
import { SimDynamoDbReturnValues } from "./sim-dynamodb-return-values.js";
import { refuseUnsimulatedItemWriteInput } from "./sim-dynamodb-unsimulated-item-write-input.js";

interface SimDynamoDbPutItemProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbPutItemOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Read the item a request writes.
 */
function readItem(input: SimPutItemCommandInput): SimDynamoDbItem {
  if (input.Item === undefined) {
    throw new SimDynamoDbValidationException("An Item is required");
  }

  return SimDynamoDbItem.fromAttributeValues(input.Item);
}

/**
 * The PutItem command.
 *
 * A put replaces the whole item under its primary key rather than merging into
 * it, which is what makes PutItem different from UpdateItem. The item is
 * written before the call returns, so a read that follows finds it.
 *
 * A ConditionExpression is checked against whatever is stored under the key
 * already. A condition that does not hold leaves the table exactly as it was.
 */
export class SimDynamoDbPutItem {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbPutItemProperties) {
    this.access = properties.access;
  }

  /**
   * Write an item, and answer with the item it replaced when asked to.
   */
  handle(
    command: SimPutItemCommand,
    options?: SimDynamoDbPutItemOptions,
  ): SimPutItemCommandOutput {
    const input = command.input;

    refuseUnsimulatedItemWriteInput(input, "PutItem");

    // The condition is read before the table is reached, so an expression
    // DynamoDB would refuse is refused whether or not the key holds anything.
    const check = SimDynamoDbConditionCheck.read(input, "PutItem");
    const table = this.access.required(
      "dynamodb:PutItem",
      input.TableName,
      options?.caller,
    );
    const asked = SimDynamoDbReturnValues.read(input.ReturnValues, "PutItem");
    const item = readItem(input);

    check.assertHoldsFor(table.itemUnder(item));

    const replaced = table.putItem(item);

    if (!asked.reportsBefore() || replaced === undefined) {
      return { $metadata: {} };
    }

    return { Attributes: replaced.toAttributeValues(), $metadata: {} };
  }
}
