import type { SimTransactGetItemsCommandInput } from "./transact.command.js";
import { SimDynamoDbReturnConsumedCapacity } from "../../capacity/sim-dynamodb-return-consumed-capacity.js";

/**
 * Refuse the TransactGetItems inputs this simulation does not model.
 */
export function refuseUnsimulatedTransactGetInput(
  input: SimTransactGetItemsCommandInput,
): void {
  // Read here so a value AWS refuses is refused before anything is read.
  SimDynamoDbReturnConsumedCapacity.read(input.ReturnConsumedCapacity);
}
