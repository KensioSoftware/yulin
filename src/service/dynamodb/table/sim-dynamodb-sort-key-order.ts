import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { compareSimDynamoDbValues } from "../item/sim-dynamodb-value-order.js";
import type { SimDynamoDbValue } from "../item/sim-dynamodb-value.js";

/**
 * The order a table's sort key puts an item collection in.
 *
 * A table with no sort key holds at most one item under a partition key, so
 * every question here has a trivial answer for one. That is why the attribute
 * name is optional rather than each caller asking whether there is one.
 *
 * The order is DynamoDB's rather than JavaScript's, through
 * `compareSimDynamoDbValues`: numbers order by value however they were written,
 * strings by their UTF-8 bytes, and binary as unsigned bytes.
 */
export class SimDynamoDbSortKeyOrder {
  private readonly attributeName: string | undefined;

  constructor(attributeName: string | undefined) {
    this.attributeName = attributeName;
  }

  /**
   * The sort key of an item, or nothing when the table has no sort key.
   */
  valueOf(item: SimDynamoDbItem): SimDynamoDbValue | undefined {
    const attributeName = this.attributeName;

    if (attributeName === undefined) {
      return undefined;
    }

    return sortKeyValue(item, attributeName);
  }

  /**
   * Items in ascending sort key order.
   */
  ascending(items: readonly SimDynamoDbItem[]): readonly SimDynamoDbItem[] {
    const attributeName = this.attributeName;

    if (attributeName === undefined) {
      return items;
    }

    return items.toSorted((first, second) =>
      this.compare(first, second, attributeName),
    );
  }

  /**
   * The items past the one a request resumes after, in the walk direction.
   *
   * With no sort key a collection holds one item, and that is the item the
   * token names, so nothing comes after it.
   */
  beyond(
    items: readonly SimDynamoDbItem[],
    after: SimDynamoDbItem,
    forward: boolean,
  ): readonly SimDynamoDbItem[] {
    const attributeName = this.attributeName;

    if (attributeName === undefined) {
      return [];
    }

    const direction = this.direction(forward);

    return items.filter(
      (item) => this.compare(item, after, attributeName) * direction > 0,
    );
  }

  /**
   * Order two items of one table by their sort keys.
   *
   * With no sort key a partition key value names at most one item, so two items
   * that reach here are the same item and nothing separates them. A scan orders
   * a whole table this way once it has ordered by partition key.
   */
  compareItems(first: SimDynamoDbItem, second: SimDynamoDbItem): number {
    const attributeName = this.attributeName;

    if (attributeName === undefined) {
      return 0;
    }

    return this.compare(first, second, attributeName);
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

  /**
   * Order two items by their sort keys.
   *
   * Two items in one table always order: the table checks the type of every key
   * attribute on the way in, so no collection holds two sort keys of different
   * types.
   */
  private compare(
    first: SimDynamoDbItem,
    second: SimDynamoDbItem,
    attributeName: string,
  ): number {
    const order = compareSimDynamoDbValues(
      sortKeyValue(first, attributeName),
      sortKeyValue(second, attributeName),
    );

    assertDefined(order, `order of two ${attributeName} sort keys`);

    return order;
  }
}

/**
 * The sort key a stored item holds.
 *
 * Every item in a table carries its key attributes: a write that left one out
 * was refused, so the value is there by the time an item is stored.
 */
function sortKeyValue(
  item: SimDynamoDbItem,
  attributeName: string,
): SimDynamoDbValue {
  const value = item.attribute(attributeName);

  assertDefined(value, `sort key ${attributeName} of a stored item`);

  return value;
}
