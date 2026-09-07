import { simDynamoDbAttributesConditionKey } from "./sim-dynamodb-attributes.js";
import { simDynamoDbLeadingKeysConditionKey } from "./sim-dynamodb-leading-keys.js";

/**
 * What one request reaches in the table it names.
 *
 * Each entry becomes a DynamoDB condition key. A request reaching nothing
 * under one of them leaves it out, as AWS leaves a key out for an operation
 * that reaches nothing it names.
 */
export interface SimDynamoDbReached {
  /** The partition key values the request reaches. */
  readonly leadingKeys?: readonly string[] | undefined;

  /** The top-level attribute names the request names. */
  readonly attributes?: readonly string[] | undefined;
}

/**
 * The condition values a request carries for the table it names.
 */
export function simDynamoDbConditionContextOf(
  reached: SimDynamoDbReached,
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    [
      [simDynamoDbLeadingKeysConditionKey, reached.leadingKeys],
      [simDynamoDbAttributesConditionKey, reached.attributes],
    ].filter(([, values]) => (values ?? []).length > 0),
  ) as Readonly<Record<string, readonly string[]>>;
}
