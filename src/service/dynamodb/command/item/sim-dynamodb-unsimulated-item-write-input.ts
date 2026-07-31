import type { SimDynamoDbExpectedAttributeValue } from "./item.types.js";
import { SimDynamoDbUnsimulatedInput } from "./sim-dynamodb-unsimulated-input.js";

/**
 * The inputs the item commands that change an item share. PutItem and
 * DeleteItem take the same conditional write and reporting inputs as each
 * other, so they refuse the same ones.
 */
interface SimDynamoDbItemWriteInput {
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly ReturnItemCollectionMetrics?: string | undefined;
  readonly Expected?:
    Readonly<Record<string, SimDynamoDbExpectedAttributeValue>> | undefined;
  readonly ConditionalOperator?: string | undefined;
}

/**
 * Refuse the inputs this simulation does not model on a command that changes an
 * item.
 *
 * `Expected` and `ConditionalOperator` are the conditional write that
 * `ConditionExpression` replaced, and real DynamoDB has built nothing on them
 * since. An expectation that is never evaluated would let a change through that
 * DynamoDB would have turned away, and capacity figures that are never measured
 * would report a cost nothing here incurs. Both are refused rather than
 * ignored.
 */
export function refuseUnsimulatedItemWriteInput(
  input: SimDynamoDbItemWriteInput,
  operation: string,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput(operation);

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
  unsimulated.refuseNamed(
    input.Expected,
    "Expected",
    "applying a change the expectation may have ruled out",
  );
  unsimulated.refuse(
    input.ConditionalOperator !== undefined,
    "ConditionalOperator",
    "combining expectations it does not evaluate",
  );
}
