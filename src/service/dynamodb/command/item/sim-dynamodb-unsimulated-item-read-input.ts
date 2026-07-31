import type { SimGetItemCommandInput } from "./item.command.js";
import { SimDynamoDbUnsimulatedInput } from "./sim-dynamodb-unsimulated-input.js";

/**
 * Refuse the GetItem inputs this simulation does not model.
 *
 * `AttributesToGet` is the way of asking for part of an item that
 * `ProjectionExpression` replaced, and real DynamoDB has not built anything on
 * it since. An item that came back whole where part of it was asked for would
 * hide an application reading an attribute it never requested, so it is refused
 * rather than ignored.
 */
export function refuseUnsimulatedItemReadInput(
  input: SimGetItemCommandInput,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("GetItem");

  unsimulated.refuse(
    (input.AttributesToGet ?? []).length > 0,
    "AttributesToGet",
    "answering with the whole item where part of it was asked for",
  );
  unsimulated.refuseReporting(
    input.ReturnConsumedCapacity,
    "ReturnConsumedCapacity",
    "reporting a capacity cost nothing here measures",
  );
}
