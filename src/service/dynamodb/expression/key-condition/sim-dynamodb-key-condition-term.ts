import type { SimDynamoDbScalarAttributeType } from "../../command/table/table.types.js";
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
