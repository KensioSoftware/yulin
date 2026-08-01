import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import {
  compareSimDynamoDbBytes,
  compareSimDynamoDbValues,
} from "../item/sim-dynamodb-value-order.js";
import type { SimDynamoDbValue } from "../item/sim-dynamodb-value.js";
import type { SimDynamoDbItemKey } from "./sim-dynamodb-item-key.js";

/**
 * The sort key a stored item holds.
 *
 * Every item of a collection carries the key attributes it is walked by. A
 * write that left a table key attribute out was refused, and an index holds
 * only the items carrying the whole of its key, so the value is there either
 * way.
 */
export function simDynamoDbSortKeyValue(
  item: SimDynamoDbItem,
  attributeName: string,
): SimDynamoDbValue {
  const value = item.attribute(attributeName);

  assertDefined(value, `sort key ${attributeName} of a stored item`);

  return value;
}

/**
 * Order two items by their sort keys.
 *
 * Two items of one collection always order: every key attribute is checked
 * against its declared type on the way in, so no collection holds two sort keys
 * of different types.
 */
export function compareSimDynamoDbSortKeys(
  first: SimDynamoDbItem,
  second: SimDynamoDbItem,
  attributeName: string,
): number {
  const order = compareSimDynamoDbValues(
    simDynamoDbSortKeyValue(first, attributeName),
    simDynamoDbSortKeyValue(second, attributeName),
  );

  assertDefined(order, `order of two ${attributeName} sort keys`);

  return order;
}

/**
 * Separate two items their sort keys did not, by the key that identifies them.
 *
 * The marshalled key is compared as UTF-8 bytes, which is the order the rest of
 * the simulation compares text in. Nothing depends on which of two items comes
 * first, only that the answer is the same every time, since an
 * `ExclusiveStartKey` could not resume a walk otherwise.
 */
export function compareSimDynamoDbItemIdentities(
  first: SimDynamoDbItem,
  second: SimDynamoDbItem,
  identity: SimDynamoDbItemKey,
): number {
  return compareSimDynamoDbBytes(
    Buffer.from(identity.of(first), "utf8"),
    Buffer.from(identity.of(second), "utf8"),
  );
}
