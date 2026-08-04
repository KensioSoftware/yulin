import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbValue } from "../item/sim-dynamodb-value.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";

/**
 * The `Keys` of a stream record, cut from the item that changed.
 *
 * Every record carries these, whatever view type the stream was enabled with,
 * because a reader that cannot say which item changed cannot do anything with
 * the record. A `KEYS_ONLY` stream is that and nothing else.
 *
 * The item is whichever image the change has: an insertion and a modification
 * have a new one, a removal has only the old one, and the key attributes are
 * the same in either since an update cannot move an item's primary key.
 */
export function simDynamoDbStreamRecordKeys(
  item: SimDynamoDbItem,
  keySchema: SimDynamoDbKeySchema,
): SimDynamoDbItem {
  const attributes = new Map<string, SimDynamoDbValue>();

  for (const attributeName of keySchema.attributeNames()) {
    const value = item.attribute(attributeName);

    // An item is stored under its primary key, so one that changed carries
    // every key attribute. Missing one would be the simulator's own fault.
    assertDefined(value, `DynamoDB key attribute ${attributeName}`);
    attributes.set(attributeName, value);
  }

  return SimDynamoDbItem.ofAttributes(attributes);
}
