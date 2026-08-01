import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimDynamoDbKeyCondition } from "../expression/key-condition/sim-dynamodb-key-condition.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { simDynamoDbValuesEqual } from "../item/sim-dynamodb-value-comparison.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import { SimDynamoDbSortKeyOrder } from "./sim-dynamodb-sort-key-order.js";

interface SimDynamoDbItemCollectionProperties {
  readonly items: Iterable<SimDynamoDbItem>;
  readonly keySchema: SimDynamoDbKeySchema;
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
 */
export class SimDynamoDbItemCollection {
  private readonly order: SimDynamoDbSortKeyOrder;
  private readonly ascending: readonly SimDynamoDbItem[];

  constructor(properties: SimDynamoDbItemCollectionProperties) {
    const { keySchema, keyCondition } = properties;
    const order = new SimDynamoDbSortKeyOrder(keySchema.rangeKeyAttributeName);

    this.order = order;
    this.ascending = order.ascending(
      [...properties.items].filter((item) =>
        this.named(item, keySchema, keyCondition),
      ),
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
   * Whether a key condition names an item: it belongs to the item collection,
   * and its sort key is inside the run the condition asks for.
   */
  private named(
    item: SimDynamoDbItem,
    keySchema: SimDynamoDbKeySchema,
    keyCondition: SimDynamoDbKeyCondition,
  ): boolean {
    const partitionKey = item.attribute(keySchema.hashKeyAttributeName);

    assertDefined(partitionKey, "partition key of a stored item");

    return (
      simDynamoDbValuesEqual(partitionKey, keyCondition.partitionKeyValue) &&
      keyCondition.holdsForSortKey(this.order.valueOf(item))
    );
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
