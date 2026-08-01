import { SimDynamoDbUnsimulatedInput } from "../item/sim-dynamodb-unsimulated-input.js";
import type {
  SimTransactGetItemsCommandInput,
  SimTransactWriteItemsCommandInput,
} from "./transact.command.js";

/**
 * Refuse the TransactWriteItems inputs this simulation does not model.
 */
export function refuseUnsimulatedTransactWriteInput(
  input: SimTransactWriteItemsCommandInput,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("TransactWriteItems");

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
 * Refuse the TransactGetItems inputs this simulation does not model.
 */
export function refuseUnsimulatedTransactGetInput(
  input: SimTransactGetItemsCommandInput,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("TransactGetItems");

  unsimulated.refuseReporting(
    input.ReturnConsumedCapacity,
    "ReturnConsumedCapacity",
    "reporting a capacity cost nothing here measures",
  );
}
