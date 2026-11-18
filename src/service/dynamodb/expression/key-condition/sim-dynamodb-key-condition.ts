import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { simDynamoDbValuesEqual } from "../../item/sim-dynamodb-value-comparison.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbKeyConditionTerm } from "./sim-dynamodb-key-condition-term.js";

interface SimDynamoDbKeyConditionProperties {
  readonly partitionKey: ReadonlyMap<string, SimDynamoDbValue>;
  readonly sortKeyTerms: readonly SimDynamoDbKeyConditionTerm[];
}

/**
 * A key condition that has been read against the key schema of the table it
 * names.
 *
 * It is two things: the partition key value whose item collection the query
 * reads, and the run of that collection the sort key conditions ask for. A
 * query with no sort key condition reads the whole collection.
 *
 * A global secondary index may key by several partition key attributes and
 * several sort key attributes, so both halves are held per attribute. A table
 * has one of each at most.
 */
export class SimDynamoDbKeyCondition {
  /**
   * The value of every partition key attribute, by attribute name.
   */
  public readonly partitionKey: ReadonlyMap<string, SimDynamoDbValue>;

  /**
   * The value of the first partition key attribute. For a table it is the
   * only one.
   */
  public readonly partitionKeyValue: SimDynamoDbValue;

  private readonly sortKeyTerms: readonly SimDynamoDbKeyConditionTerm[];

  constructor(properties: SimDynamoDbKeyConditionProperties) {
    const [first] = properties.partitionKey.values();
    assertDefined(first, "partition key value of a key condition");

    this.partitionKey = properties.partitionKey;
    this.partitionKeyValue = first;
    this.sortKeyTerms = properties.sortKeyTerms;
  }

  /**
   * Whether this condition names an item: it belongs to the item collection,
   * and its sort key is inside the run the condition asks for.
   *
   * Every item a view holds carries the whole of its key, so each attribute a
   * term tests is there to be read.
   */
  names(item: SimDynamoDbItem): boolean {
    for (const [attributeName, value] of this.partitionKey) {
      const held = item.attribute(attributeName);

      if (held === undefined || !simDynamoDbValuesEqual(held, value)) {
        return false;
      }
    }

    return this.sortKeyTerms.every((term) => {
      const value = item.attribute(term.attributeName);

      assertDefined(value, `sort key ${term.attributeName} of a stored item`);

      return term.holdsFor(value);
    });
  }
}
