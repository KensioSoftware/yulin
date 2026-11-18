import type { SimDynamoDbKeyCondition } from "../expression/key-condition/sim-dynamodb-key-condition.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbSortKeyOrder } from "./sim-dynamodb-sort-key-order.js";

interface SimDynamoDbItemCollectionProperties {
  readonly items: Iterable<SimDynamoDbItem>;
  readonly order: SimDynamoDbSortKeyOrder;
  readonly keyCondition: SimDynamoDbKeyCondition;
}

interface SimDynamoDbItemCollectionWalk {
  readonly forward: boolean;
  readonly after?: SimDynamoDbItem | undefined;
}

/**
 * The items one key condition names, in sort key order.
 *
 * A table holds its items in a map keyed by the marshalled primary key, which
 * carries no order at all, so an item collection is gathered and ordered when
 * it is read rather than kept that way. Real DynamoDB keeps a collection in
 * sort key order, and a query reads the same items in the same order either
 * way.
 *
 * The key condition was read against the key schema being read by, which for a
 * query on an index is the index's own rather than the table's. The order comes
 * in alongside it, since what separates two items sharing a sort key is the
 * view's business rather than the collection's.
 */
export class SimDynamoDbItemCollection {
  private readonly order: SimDynamoDbSortKeyOrder;
  private readonly ascending: readonly SimDynamoDbItem[];

  constructor(properties: SimDynamoDbItemCollectionProperties) {
    const { keyCondition, order } = properties;

    this.order = order;
    this.ascending = order.ascending(
      [...properties.items].filter((item) => keyCondition.names(item)),
    );
  }

  /**
   * The collection in the order a query walks it, from the key it resumes
   * after.
   */
  walk(properties: SimDynamoDbItemCollectionWalk): readonly SimDynamoDbItem[] {
    const inOrder = this.inOrder(properties.forward);
    const after = properties.after;

    if (after === undefined) {
      return inOrder;
    }

    return this.order.beyond(inOrder, after, properties.forward);
  }

  /**
   * The collection in the direction `ScanIndexForward` asked for.
   */
  private inOrder(forward: boolean): readonly SimDynamoDbItem[] {
    if (forward) {
      return this.ascending;
    }

    return this.ascending.toReversed();
  }
}
