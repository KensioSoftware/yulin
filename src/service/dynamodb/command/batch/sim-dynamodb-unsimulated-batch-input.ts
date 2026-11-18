import type { SimBatchGetItemCommandInput } from "./batch.command.js";
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
