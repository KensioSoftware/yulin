import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbItemKey } from "./sim-dynamodb-item-key.js";
import {
  compareSimDynamoDbItemIdentities,
  compareSimDynamoDbSortKeys,
} from "./sim-dynamodb-sort-key-compare.js";

interface SimDynamoDbSortKeyOrderProperties {
  readonly attributeNames: readonly string[];
  readonly identity?: SimDynamoDbItemKey | undefined;
}

/**
 * The order a sort key puts an item collection in.
 *
 * A table with no sort key holds at most one item under a partition key, so
 * every question here has a trivial answer for one. That is why the list of
 * sort key attributes may be empty rather than each caller asking whether there
 * is one. A global secondary index may sort by up to four attributes, and
 * orders by the first, then by the second among items sharing the first, and
 * so on.
 *
 * The order is DynamoDB's rather than JavaScript's: numbers order by value
 * however they were written, strings by their UTF-8 bytes, and binary as
 * unsigned bytes.
 *
 * An index needs one thing more. Index key values are not unique, so a sort key
 * settles nothing between two items sharing one, and a walk that could not tell
 * them apart could not resume after either. The identity is what separates
 * them: the table primary key, which is unique by definition. That is why a
 * read of an index hands out a token carrying both.
 */
export class SimDynamoDbSortKeyOrder {
  private readonly attributeNames: readonly string[];
  private readonly identity: SimDynamoDbItemKey | undefined;

  constructor(properties: SimDynamoDbSortKeyOrderProperties) {
    this.attributeNames = properties.attributeNames;
    this.identity = properties.identity;
  }

  /**
   * Items in ascending sort key order.
   */
  ascending(items: readonly SimDynamoDbItem[]): readonly SimDynamoDbItem[] {
    return items.toSorted((first, second) => this.compareItems(first, second));
  }

  /**
   * The items past the one a request resumes after, in the walk direction.
   *
   * With nothing to order a collection by, it holds one item, and that is the
   * item the token names, so nothing comes after it.
   */
  beyond(
    items: readonly SimDynamoDbItem[],
    after: SimDynamoDbItem,
    forward: boolean,
  ): readonly SimDynamoDbItem[] {
    const direction = this.direction(forward);

    return items.filter(
      (item) => this.compareItems(item, after) * direction > 0,
    );
  }

  /**
   * Order two items of one collection, by sort key and then by identity.
   *
   * With neither a sort key nor an identity, a partition key value names at
   * most one item, so two items that reach here are the same item and nothing
   * separates them. A scan orders a whole table this way once it has ordered by
   * partition key.
   */
  compareItems(first: SimDynamoDbItem, second: SimDynamoDbItem): number {
    const bySortKey = this.compareSortKeys(first, second);

    if (bySortKey !== 0) {
      return bySortKey;
    }

    return this.compareIdentities(first, second);
  }

  /**
   * Order two items by their sort key attributes, one after another.
   */
  private compareSortKeys(
    first: SimDynamoDbItem,
    second: SimDynamoDbItem,
  ): number {
    for (const attributeName of this.attributeNames) {
      const order = compareSimDynamoDbSortKeys(first, second, attributeName);

      if (order !== 0) {
        return order;
      }
    }

    return 0;
  }

  /**
   * Separate two items their sort keys did not, where something can.
   */
  private compareIdentities(
    first: SimDynamoDbItem,
    second: SimDynamoDbItem,
  ): number {
    const identity = this.identity;

    if (identity === undefined) {
      return 0;
    }

    return compareSimDynamoDbItemIdentities(first, second, identity);
  }

  /**
   * Which way along the sort key the walk is going.
   */
  private direction(forward: boolean): number {
    if (forward) {
      return 1;
    }

    return -1;
  }
}
