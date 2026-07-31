import type { SimUpdateItemCommandInput } from "./item.command.js";
import { SimDynamoDbUnsimulatedInput } from "./sim-dynamodb-unsimulated-input.js";
import { refuseUnsimulatedItemWriteInput } from "./sim-dynamodb-unsimulated-item-write-input.js";

/**
 * Refuse the UpdateItem request inputs this simulation does not model.
 *
 * UpdateItem takes the same conditional write and reporting inputs the other
 * item writes do, and one of its own. `AttributeUpdates` is the change
 * `UpdateExpression` replaced, and real DynamoDB has built nothing on it since.
 * An update that was never applied would leave a test passing against an item
 * the real call would have changed, so it is refused rather than dropped.
 */
export function refuseUnsimulatedItemUpdateInput(
  input: SimUpdateItemCommandInput,
): void {
  refuseUnsimulatedItemWriteInput(input, "UpdateItem");

  new SimDynamoDbUnsimulatedInput("UpdateItem").refuseNamed(
    input.AttributeUpdates,
    "AttributeUpdates",
    "applying a change it does not read",
  );
}
