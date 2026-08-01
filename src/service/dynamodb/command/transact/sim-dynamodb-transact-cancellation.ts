import {
  SimDynamoDbConditionalCheckFailedException,
  SimDynamoDbTransactionCanceledException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimDynamoDbTransactTarget } from "./sim-dynamodb-transact-tables.js";
import type { SimDynamoDbTransactWrite } from "./sim-dynamodb-transact-write.js";
import type { SimDynamoDbCancellationReason } from "./transact.command.js";

/**
 * The code an action that was fine carries.
 *
 * Every action is reported, so the actions that would have gone through are in
 * the answer too. That is what makes the reasons line up with the request.
 */
const none = "None";

/**
 * The code an action whose ConditionExpression did not hold carries.
 *
 * The codes have no `Exception` suffix, unlike the errors of the same name that
 * the single item commands throw.
 */
const conditionalCheckFailed = "ConditionalCheckFailed";

/**
 * Apply every action of a transaction, or none of them.
 *
 * Nothing is written until every action has been checked against what is
 * stored, which is what makes a transaction one step rather than a run of
 * writes that might stop part way.
 */
export function applySimDynamoDbTransaction(
  targets: readonly SimDynamoDbTransactTarget<SimDynamoDbTransactWrite>[],
): void {
  assertApplies(targets);

  for (const { item, table } of targets) {
    item.applyTo(table);
  }
}

/**
 * Refuse a transaction any of whose actions could not be applied.
 *
 * Every action is checked, not just up to the first failure, since a caller
 * reads which of its actions failed out of the cancellation reasons. Nothing
 * has been written by the time this throws.
 */
function assertApplies(
  targets: readonly SimDynamoDbTransactTarget<SimDynamoDbTransactWrite>[],
): void {
  const reasons = targets.map(({ item, table }) => reasonFor(item, table));

  if (reasons.every((reason) => reason.Code === none)) {
    return;
  }

  throw new SimDynamoDbTransactionCanceledException(reasons);
}

/**
 * Why one action was cancelled, or that it was not.
 *
 * A condition that did not hold is this action's own failure, so it becomes its
 * reason. Anything else is the request being wrong rather than the transaction
 * being cancelled, so it is left to throw.
 */
function reasonFor(
  write: SimDynamoDbTransactWrite,
  table: SimDynamoDbTable,
): SimDynamoDbCancellationReason {
  try {
    write.assertApplicableTo(table);
  } catch (error) {
    if (error instanceof SimDynamoDbConditionalCheckFailedException) {
      return conditionFailure(error);
    }

    throw error;
  }

  return { Code: none };
}

/**
 * The reason a failed condition gives.
 *
 * `Item` is only there when the action asked for it with
 * `ReturnValuesOnConditionCheckFailure`, and only when there was an item to
 * report. A condition that turned away a write to a key holding nothing gives a
 * reason with no `Item`.
 */
function conditionFailure(
  thrown: SimDynamoDbConditionalCheckFailedException,
): SimDynamoDbCancellationReason {
  if (thrown.Item === undefined) {
    return { Code: conditionalCheckFailed, Message: thrown.message };
  }

  return {
    Code: conditionalCheckFailed,
    Message: thrown.message,
    Item: thrown.Item,
  };
}
