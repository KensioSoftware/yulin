import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * Read the Key a request names one item by.
 *
 * The Key is read as an item, which is what checks the attribute values it
 * carries. What makes it a key rather than an item is checked against the
 * table's key schema, in `SimDynamoDbItemKey`, so GetItem and DeleteItem are
 * both held to the same rules.
 */
export function readSimDynamoDbKey(
  key: Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined,
): SimDynamoDbItem {
  if (key === undefined || Object.keys(key).length === 0) {
    throw new SimDynamoDbValidationException("A Key is required");
  }

  return SimDynamoDbItem.fromAttributeValues(key);
}
