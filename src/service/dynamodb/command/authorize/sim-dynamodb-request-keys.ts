import type { SimIamConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";

/**
 * The request parameters DynamoDB names a condition key after.
 *
 * Each is one string, and an action that takes the parameter supplies it with
 * the value the request asked for, or the value DynamoDB defaults to. An action
 * that takes no such parameter leaves it out.
 */
export interface SimDynamoDbRequestKeys {
  /** `dynamodb:Select`, on a read that returns item attributes. */
  readonly select?: string | undefined;

  /** `dynamodb:ReturnValues`, on a write. */
  readonly returnValues?: string | undefined;

  /** `dynamodb:ReturnConsumedCapacity`, on an item operation. */
  readonly returnConsumedCapacity?: string | undefined;

  /** `dynamodb:EnclosingOperation`, on an item action inside a transaction. */
  readonly enclosingOperation?: string | undefined;
}

/**
 * The condition key each request parameter is supplied under.
 */
const requestConditionKeys = {
  select: "dynamodb:Select",
  returnValues: "dynamodb:ReturnValues",
  returnConsumedCapacity: "dynamodb:ReturnConsumedCapacity",
  enclosingOperation: "dynamodb:EnclosingOperation",
} as const satisfies Record<keyof SimDynamoDbRequestKeys, string>;

/**
 * The condition values a request's parameters supply, leaving out the ones the
 * action does not take.
 */
export function simDynamoDbRequestKeyConditions(
  keys: SimDynamoDbRequestKeys,
): SimIamConditions {
  return Object.fromEntries(
    Object.entries(requestConditionKeys).flatMap(([field, conditionKey]) => {
      const value = keys[field as keyof SimDynamoDbRequestKeys];

      return value === undefined ? [] : [[conditionKey, value]];
    }),
  );
}

/**
 * The `dynamodb:ReturnValues` a write supplies.
 *
 * AWS documents the parameter as always having a value on a write, `NONE`
 * unless the request asked for another. The key also governs the item a
 * failed condition returns, so a write returning nothing on success but
 * `ALL_OLD` on failure supplies `ALL_OLD`.
 */
export function simDynamoDbReturnValuesKey(
  returnValues = "NONE",
  onConditionFailure = "NONE",
): string {
  return returnValues === "NONE" ? onConditionFailure : returnValues;
}

/**
 * The `dynamodb:ReturnConsumedCapacity` an item operation supplies, `NONE`
 * unless the request asked for another.
 */
export function simDynamoDbReturnConsumedCapacityKey(
  returnConsumedCapacity = "NONE",
): string {
  return returnConsumedCapacity;
}

/**
 * The `dynamodb:Select` a read of whole items by key supplies.
 *
 * `GetItem`, `BatchGetItem` and a transactional `Get` take no `Select`
 * parameter. A read naming a projection asks for specific attributes, and one
 * naming none asks for all of them.
 */
export function simDynamoDbKeyReadSelectKey(projects: boolean): string {
  return projects ? "SPECIFIC_ATTRIBUTES" : "ALL_ATTRIBUTES";
}
