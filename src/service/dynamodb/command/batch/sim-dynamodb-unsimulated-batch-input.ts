import { SimDynamoDbUnsimulatedInput } from "../item/sim-dynamodb-unsimulated-input.js";
import type {
  SimBatchGetItemCommandInput,
  SimDynamoDbKeysAndAttributes,
} from "./batch.command.js";
import { SimDynamoDbReturnConsumedCapacity } from "../../capacity/sim-dynamodb-return-consumed-capacity.js";

/**
 * Refuse the BatchGetItem inputs this simulation does not model.
 */
export function refuseUnsimulatedBatchReadInput(
  input: SimBatchGetItemCommandInput,
): void {
  // Read here so a value AWS refuses is refused before anything is read.
  SimDynamoDbReturnConsumedCapacity.read(input.ReturnConsumedCapacity);
}

/**
 * Refuse what one table of a batch read asks for and this simulation does not
 * model.
 *
 * `AttributesToGet` is the way of asking for part of an item that
 * `ProjectionExpression` replaced, and GetItem refuses it for the same reason:
 * an item that came back whole where part of it was asked for would hide an
 * application reading an attribute it never requested.
 */
export function refuseUnsimulatedBatchKeysAndAttributes(
  requested: SimDynamoDbKeysAndAttributes,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("BatchGetItem");

  unsimulated.refuse(
    (requested.AttributesToGet ?? []).length > 0,
    "AttributesToGet",
    "answering with the whole item where part of it was asked for",
  );
}
