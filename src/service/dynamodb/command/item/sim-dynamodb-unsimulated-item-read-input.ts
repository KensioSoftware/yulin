import type { SimGetItemCommandInput } from "./item.command.js";
import { SimDynamoDbUnsimulatedInput } from "./sim-dynamodb-unsimulated-input.js";

/**
 * Refuse the GetItem inputs this simulation does not model.
 *
 * Every way of asking for part of an item is refused. An item that came back
 * whole where a projection was asked for would hide an application reading an
 * attribute it never requested.
 */
export function refuseUnsimulatedItemReadInput(
  input: SimGetItemCommandInput,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("GetItem");

  unsimulated.refuse(
    input.ProjectionExpression !== undefined,
    "ProjectionExpression",
    "answering with the whole item where part of it was asked for",
  );
  unsimulated.refuseNamed(
    input.ExpressionAttributeNames,
    "ExpressionAttributeNames",
    "accepting names for an expression it cannot evaluate",
  );
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
