import { simDynamoDbExpressionsOf } from "../../expression/legacy/sim-dynamodb-legacy-request.js";
import { simDynamoDbLegacyUpdateCreatesItem } from "../../expression/legacy/sim-dynamodb-legacy-update.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimUpdateItemCommandInput } from "./item.command.js";
import type { SimDynamoDbUpdatePlan } from "./sim-dynamodb-update-plan.js";

/**
 * An UpdateItem request with its legacy parameters rewritten as expressions.
 */
export interface SimDynamoDbUpdateItemRequest {
  readonly input: SimUpdateItemCommandInput;

  /**
   * Whether the update creates an item under a key that holds none.
   *
   * A legacy update made only of `DELETE` actions leaves an empty key empty,
   * which is the one place a legacy update differs from its expression. It is
   * decided from the request as it arrived.
   */
  readonly createsItem: boolean;
}

/**
 * Read an UpdateItem request, rewriting its legacy parameters.
 */
export function readSimDynamoDbUpdateItemRequest(
  input: SimUpdateItemCommandInput,
): SimDynamoDbUpdateItemRequest {
  return {
    input: simDynamoDbExpressionsOf(input),
    createsItem: simDynamoDbLegacyUpdateCreatesItem(input.AttributeUpdates),
  };
}

/**
 * The item an update leaves under its key, or nothing where it writes none.
 */
export function simDynamoDbUpdatedItem(
  request: SimDynamoDbUpdateItemRequest,
  plan: SimDynamoDbUpdatePlan,
  existing: SimDynamoDbItem | undefined,
  key: SimDynamoDbItem,
): SimDynamoDbItem | undefined {
  if (existing === undefined && !request.createsItem) {
    return undefined;
  }

  return plan.applyTo(existing, key);
}
