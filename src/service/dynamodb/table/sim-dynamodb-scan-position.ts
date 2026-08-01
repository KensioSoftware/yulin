import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { compareSimDynamoDbBytes } from "../item/sim-dynamodb-value-order.js";
import { simDynamoDbPartitionKeyHash } from "./sim-dynamodb-partition-key-hash.js";
import type { SimDynamoDbScanSegment } from "./sim-dynamodb-scan-segment.js";
import type { SimDynamoDbSortKeyOrder } from "./sim-dynamodb-sort-key-order.js";

interface SimDynamoDbScanPositionProperties {
  readonly item: SimDynamoDbItem;
  readonly partitionKey: string;
  readonly sortKeyOrder: SimDynamoDbSortKeyOrder;
}

/**
 * Where one item sits in the order a scan walks a table in.
 *
 * The order is by the hash of the partition key first, then by sort key inside
 * one partition key value. That gives two things a scan needs. Items under one
 * partition key come back together and ascending, as they do on AWS. Partition
 * key values come back in an order that is not the sorted one, so a test cannot
 * quietly come to depend on a global ordering that real DynamoDB does not give.
 *
 * The order has to be a total order all the same, otherwise an
 * `ExclusiveStartKey` could not say where to resume from. Partition key values
 * that hash alike are ordered by their marshalled bytes to settle that.
 *
 * A position is also worked out for the Key a request resumes after, which is
 * why it is built from a key and a sort key order rather than read off a stored
 * item: the item the token names may since have been deleted.
 */
export class SimDynamoDbScanPosition {
  public readonly item: SimDynamoDbItem;

  private readonly partitionKey: string;
  private readonly hash: number;
  private readonly sortKeyOrder: SimDynamoDbSortKeyOrder;

  constructor(properties: SimDynamoDbScanPositionProperties) {
    this.item = properties.item;
    this.partitionKey = properties.partitionKey;
    this.hash = simDynamoDbPartitionKeyHash(properties.partitionKey);
    this.sortKeyOrder = properties.sortKeyOrder;
  }

  /**
   * Whether a parallel scan segment holds this item.
   */
  inSegment(segment: SimDynamoDbScanSegment): boolean {
    return segment.holds(this.partitionKey);
  }

  /**
   * Order this position against another position in the same table.
   */
  compareTo(other: SimDynamoDbScanPosition): number {
    const partitions = this.comparePartitions(other);

    if (partitions !== 0) {
      return partitions;
    }

    return this.sortKeyOrder.compareItems(this.item, other.item);
  }

  /**
   * Order two partition key values, by their hash and then by their bytes.
   */
  private comparePartitions(other: SimDynamoDbScanPosition): number {
    if (this.hash !== other.hash) {
      return this.hash - other.hash;
    }

    return compareSimDynamoDbBytes(
      Buffer.from(this.partitionKey, "utf8"),
      Buffer.from(other.partitionKey, "utf8"),
    );
  }
}
