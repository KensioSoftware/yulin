import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimPutItemCommandInput } from "./item.command.js";

/**
 * Refuse a request input that asks for something, rather than one that names
 * the default and asks for nothing.
 */
function refuseAsked(asked: boolean, name: string, reason: string): void {
  if (asked) {
    throw new SimDynamoDbUnsupportedOperation(
      `${name} is not simulated, so PutItem refuses it rather than ${reason}`,
    );
  }
}

/**
 * Refuse the PutItem inputs this simulation does not model.
 *
 * A condition that is never evaluated would let a write through that DynamoDB
 * would have turned away, and capacity figures that are never measured would
 * report a cost nothing here incurs. Both are refused rather than ignored.
 *
 * The `NONE` a request can name for the reporting inputs asks for what this
 * simulation already does, so it is let through.
 */
export function refuseUnsimulatedItemInput(
  input: SimPutItemCommandInput,
): void {
  refuseAsked(
    input.ConditionExpression !== undefined,
    "ConditionExpression",
    "writing an item the condition may have ruled out",
  );
  refuseAsked(
    Object.keys(input.ExpressionAttributeNames ?? {}).length > 0,
    "ExpressionAttributeNames",
    "accepting names for an expression it cannot evaluate",
  );
  refuseAsked(
    Object.keys(input.ExpressionAttributeValues ?? {}).length > 0,
    "ExpressionAttributeValues",
    "accepting values for an expression it cannot evaluate",
  );
  refuseAsked(
    isAsked(input.ReturnConsumedCapacity),
    "ReturnConsumedCapacity",
    "reporting a capacity cost nothing here measures",
  );
  refuseAsked(
    isAsked(input.ReturnItemCollectionMetrics),
    "ReturnItemCollectionMetrics",
    "reporting item collection sizes nothing here tracks",
  );
  refuseAsked(
    isAsked(input.ReturnValuesOnConditionCheckFailure),
    "ReturnValuesOnConditionCheckFailure",
    "answering for a condition check that never happens",
  );
  refuseAsked(
    Object.keys(input.Expected ?? {}).length > 0,
    "Expected",
    "writing an item the expectation may have ruled out",
  );
  refuseAsked(
    input.ConditionalOperator !== undefined,
    "ConditionalOperator",
    "combining expectations it does not evaluate",
  );
}

/**
 * Check whether a reporting input asks for anything.
 *
 * `NONE` is the default every one of them already behaves as.
 */
function isAsked(value: string | undefined): boolean {
  return value !== undefined && value !== "NONE";
}
