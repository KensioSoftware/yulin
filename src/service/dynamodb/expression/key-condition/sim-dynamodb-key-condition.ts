import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbKeyConditionTerm } from "./sim-dynamodb-key-condition-term.js";

interface SimDynamoDbKeyConditionProperties {
  readonly partitionKeyValue: SimDynamoDbValue;
  readonly sortKeyTerm?: SimDynamoDbKeyConditionTerm | undefined;
}

/**
 * A key condition that has been read against the key schema of the table it
 * names.
 *
 * It is two things: the one partition key value whose item collection the query
 * reads, and the run of that collection the sort key condition asks for. A
 * query with no sort key condition reads the whole collection.
 */
export class SimDynamoDbKeyCondition {
  public readonly partitionKeyValue: SimDynamoDbValue;

  private readonly sortKeyTerm: SimDynamoDbKeyConditionTerm | undefined;

  constructor(properties: SimDynamoDbKeyConditionProperties) {
    this.partitionKeyValue = properties.partitionKeyValue;
    this.sortKeyTerm = properties.sortKeyTerm;
  }

  /**
   * Whether an item's sort key is inside the run this condition asks for.
   *
   * The value is only absent for a table with no sort key, and such a table
   * carries no sort key condition either, so the term is already gone by then.
   */
  holdsForSortKey(value: SimDynamoDbValue | undefined): boolean {
    const term = this.sortKeyTerm;

    if (term === undefined) {
      return true;
    }

    assertDefined(value, `sort key ${term.attributeName} of a stored item`);

    return term.holdsFor(value);
  }
}
