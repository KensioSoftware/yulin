import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { SimDynamoDbScanSegment } from "../table/sim-dynamodb-scan-segment.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import { simDynamoDbIndexEntriesSize } from "./sim-dynamodb-index-entry.js";

const bytesPerGb = 1024 * 1024 * 1024;

/**
 * The size an item collection estimate is reported in.
 */
export interface SimDynamoDbItemCollectionSize {
  readonly ItemCollectionKey: Readonly<
    Record<string, SimDynamoDbAttributeValue>
  >;
  readonly SizeEstimateRangeGB: readonly number[];
}

/**
 * The size of the item collection a write left an item in.
 *
 * Only a table with a local secondary index has item collections, since the
 * 10 GB limit they report against comes from the index sharing the table's
 * partition. AWS reports nothing for any other table, and so does this.
 *
 * The collection is every item under the item's partition key, plus each
 * one's entries in the local secondary indexes. AWS reports the size as a
 * range in gigabytes. Here it is the whole gigabytes the collection holds and
 * one more, which is the `[0, 1]` a test table gives on AWS.
 */
export function simDynamoDbItemCollectionSize(
  table: SimDynamoDbTable,
  item: SimDynamoDbItem,
): SimDynamoDbItemCollectionSize | undefined {
  const localIndexes = table.indexes.local.elements;

  if (localIndexes.length === 0) {
    return undefined;
  }

  const partitionKey = table.keySchema.hashKeyAttributeName;
  const entriesSize = simDynamoDbIndexEntriesSize(table, localIndexes);
  const partition = valueOf(item, partitionKey);
  const collection = table
    .view(undefined)
    .scan()
    .walk({ segment: SimDynamoDbScanSegment.whole(), after: undefined })
    .filter((member) => valueOf(member, partitionKey) === partition);
  const bytes = collection.reduce(
    (total, member) => total + member.sizeInBytes() + entriesSize(member),
    0,
  );
  const gigabytes = Math.floor(bytes / bytesPerGb);

  return {
    ItemCollectionKey: keyOf(item, partitionKey),
    SizeEstimateRangeGB: [gigabytes, gigabytes + 1],
  };
}

/**
 * The partition key attribute of an item, as an attribute map.
 */
function keyOf(
  item: SimDynamoDbItem,
  partitionKey: string,
): Readonly<Record<string, SimDynamoDbAttributeValue>> {
  return Object.fromEntries(
    Object.entries(item.toAttributeValues()).filter(
      ([name]) => name === partitionKey,
    ),
  );
}

function valueOf(item: SimDynamoDbItem, name: string): string {
  return jsonStringify(keyOf(item, name));
}
