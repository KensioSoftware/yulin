import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { writeSimDynamoDbValue } from "../item/sim-dynamodb-value-writer.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";

/**
 * The primary key of a stored item, as the attribute values a pagination token
 * carries.
 *
 * `LastEvaluatedKey` is the primary key of the item a walk stopped on, and the
 * `ExclusiveStartKey` of the next request is the same thing read back, so it is
 * written here once for whatever hands out a page.
 *
 * Every item in a table carries its key attributes. A write that left one out
 * was refused, so the value is there by the time an item is stored.
 */
export function simDynamoDbPrimaryKeyAttributes(
  item: SimDynamoDbItem,
  keySchema: SimDynamoDbKeySchema,
): Record<string, SimDynamoDbAttributeValue> {
  return Object.fromEntries(
    keySchema.attributeNames().map((attributeName) => {
      const value = item.attribute(attributeName);

      assertDefined(value, `key attribute ${attributeName} of a stored item`);

      return [attributeName, writeSimDynamoDbValue(value)];
    }),
  );
}
