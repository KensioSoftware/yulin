import { SimDynamoDbUnsimulatedInput } from "../item/sim-dynamodb-unsimulated-input.js";
import type {
  SimBatchGetItemCommandInput,
  SimBatchWriteItemCommandInput,
  SimDynamoDbKeysAndAttributes,
} from "./batch.command.js";

/**
 * Refuse the BatchWriteItem inputs this simulation does not model.
 */
export function refuseUnsimulatedBatchWriteInput(
  input: SimBatchWriteItemCommandInput,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("BatchWriteItem");

  unsimulated.refuseReporting(
    input.ReturnConsumedCapacity,
    "ReturnConsumedCapacity",
    "reporting a capacity cost nothing here measures",
  );
  unsimulated.refuseReporting(
    input.ReturnItemCollectionMetrics,
    "ReturnItemCollectionMetrics",
    "reporting item collection sizes nothing here tracks",
  );
}

/**
 * Refuse the BatchGetItem inputs this simulation does not model.
 */
export function refuseUnsimulatedBatchReadInput(
  input: SimBatchGetItemCommandInput,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("BatchGetItem");

  unsimulated.refuseReporting(
    input.ReturnConsumedCapacity,
    "ReturnConsumedCapacity",
    "reporting a capacity cost nothing here measures",
  );
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
