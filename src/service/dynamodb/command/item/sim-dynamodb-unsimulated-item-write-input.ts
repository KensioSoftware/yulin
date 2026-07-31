import type {
  SimDynamoDbAttributeValue,
  SimDynamoDbExpectedAttributeValue,
} from "./item.types.js";
import { SimDynamoDbUnsimulatedInput } from "./sim-dynamodb-unsimulated-input.js";

/**
 * The inputs the item commands that change an item share. PutItem and
 * DeleteItem take the same conditional write and reporting inputs as each
 * other, so they refuse the same ones.
 */
interface SimDynamoDbItemWriteInput {
  readonly ConditionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly ExpressionAttributeValues?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly ReturnItemCollectionMetrics?: string | undefined;
  readonly ReturnValuesOnConditionCheckFailure?: string | undefined;
  readonly Expected?:
    Readonly<Record<string, SimDynamoDbExpectedAttributeValue>> | undefined;
  readonly ConditionalOperator?: string | undefined;
}

/**
 * Refuse the inputs this simulation does not model on a command that changes an
 * item.
 *
 * A condition that is never evaluated would let a change through that DynamoDB
 * would have turned away, and capacity figures that are never measured would
 * report a cost nothing here incurs. Both are refused rather than ignored.
 */
export function refuseUnsimulatedItemWriteInput(
  input: SimDynamoDbItemWriteInput,
  operation: string,
): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput(operation);

  unsimulated.refuse(
    input.ConditionExpression !== undefined,
    "ConditionExpression",
    "applying a change the condition may have ruled out",
  );
  unsimulated.refuseNamed(
    input.ExpressionAttributeNames,
    "ExpressionAttributeNames",
    "accepting names for an expression it cannot evaluate",
  );
  unsimulated.refuseNamed(
    input.ExpressionAttributeValues,
    "ExpressionAttributeValues",
    "accepting values for an expression it cannot evaluate",
  );
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
  unsimulated.refuseReporting(
    input.ReturnValuesOnConditionCheckFailure,
    "ReturnValuesOnConditionCheckFailure",
    "answering for a condition check that never happens",
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
