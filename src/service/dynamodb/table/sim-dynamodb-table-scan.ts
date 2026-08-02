import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbItemKey } from "./sim-dynamodb-item-key.js";
import { SimDynamoDbScanPosition } from "./sim-dynamodb-scan-position.js";
import type { SimDynamoDbScanSegment } from "./sim-dynamodb-scan-segment.js";
import type { SimDynamoDbSortKeyOrder } from "./sim-dynamodb-sort-key-order.js";

interface SimDynamoDbTableScanProperties {
  readonly items: Iterable<SimDynamoDbItem>;
  readonly order: SimDynamoDbSortKeyOrder;
  readonly itemKey: SimDynamoDbItemKey;
}

interface SimDynamoDbTableScanWalk {
  readonly segment: SimDynamoDbScanSegment;
  readonly after?: SimDynamoDbItem | undefined;
}

/**
 * Every item one table holds, in the order a Scan reads them.
 *
 * A table holds its items in a map keyed by the marshalled primary key, which
 * carries no order at all, so the scan order is worked out when the table is
 * read rather than kept. Two scans of an unchanged table walk it the same way,
 * which is what lets an `ExclusiveStartKey` resume one.
 */
export class SimDynamoDbTableScan {
  private readonly itemKey: SimDynamoDbItemKey;
  private readonly sortKeyOrder: SimDynamoDbSortKeyOrder;
  private readonly positions: readonly SimDynamoDbScanPosition[];

  constructor(properties: SimDynamoDbTableScanProperties) {
    this.itemKey = properties.itemKey;
    this.sortKeyOrder = properties.order;
    this.positions = [...properties.items]
      .map((item) => this.positionOf(item))
      .toSorted((first, second) => first.compareTo(second));
  }

  /**
   * Where an item or a request's Key sits in this table's scan order.
   */
  positionOf(item: SimDynamoDbItem): SimDynamoDbScanPosition {
    return new SimDynamoDbScanPosition({
      item,
      partitionKey: this.itemKey.partitionOf(item),
      sortKeyOrder: this.sortKeyOrder,
    });
  }

  /**
   * The items one segment holds, from the key the request resumes after.
   */
  walk(properties: SimDynamoDbTableScanWalk): readonly SimDynamoDbItem[] {
    const held = this.positions.filter((position) =>
      position.inSegment(properties.segment),
    );

    return this.beyond(held, properties.after).map((position) => position.item);
  }

  /**
   * The positions past the one a request resumes after.
   *
   * The token says where to resume rather than which item to return to, so this
   * compares positions rather than looking the item up. An item that has since
   * been deleted still names a place in the order.
   */
  private beyond(
    positions: readonly SimDynamoDbScanPosition[],
    after: SimDynamoDbItem | undefined,
  ): readonly SimDynamoDbScanPosition[] {
    if (after === undefined) {
      return positions;
    }

    const from = this.positionOf(after);

    return positions.filter((position) => position.compareTo(from) > 0);
  }
}
