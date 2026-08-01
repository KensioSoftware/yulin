import type { SimDynamoDbScalarAttributeType } from "../../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";

/**
 * One test a key condition makes against one key attribute.
 *
 * A key condition is a closed grammar rather than a general condition, so there
 * are only three of these: a comparison, a range, and a prefix. Each is its own
 * class, since what they refuse and how they read a value differ.
 */
export interface SimDynamoDbKeyConditionTerm {
  /** The attribute this term names, before anything knows if it is a key. */
  readonly attributeName: string;
  /** How the term was written, for a refusal to name it. */
  readonly operator: string;

  /**
   * Whether a key value is inside what this term asks for.
   */
  holdsFor(value: SimDynamoDbValue): boolean;

  /**
   * Refuse a term that cannot be applied to the key attribute it names.
   */
  assertUsableOn(type: SimDynamoDbScalarAttributeType): void;
}

/**
 * Refuse a value of a type the table did not declare for a key attribute.
 *
 * A key attribute has exactly one type, so a condition comparing it against
 * another type can never hold for any item. Real DynamoDB refuses the request,
 * and so does this: answering with nothing instead would read as an item
 * collection that happens to be empty, which is a test passing here on a query
 * that fails on deploy.
 */
export function assertSimDynamoDbKeyValueType(
  attributeName: string,
  value: SimDynamoDbValue,
  type: SimDynamoDbScalarAttributeType,
): void {
  if (value.kind !== type) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Condition parameter type ` +
        `does not match schema type. The key attribute ${attributeName} is ` +
        `${type}, and the key condition compares it against ${value.kind}.`,
    );
  }
}
