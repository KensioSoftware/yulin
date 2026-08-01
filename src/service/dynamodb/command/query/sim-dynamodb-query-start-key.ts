import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbKeyCondition } from "../../expression/key-condition/sim-dynamodb-key-condition.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { simDynamoDbValuesEqual } from "../../item/sim-dynamodb-value-comparison.js";
import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";

interface SimDynamoDbQueryStartKeyProperties {
  readonly view: SimDynamoDbReadView;
  readonly keyCondition: SimDynamoDbKeyCondition;
  readonly exclusiveStartKey:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
}

/**
 * Read the key a query resumes after, if the request carries one.
 *
 * The token a page hands out is the primary key of the item the walk stopped
 * on, so it is read back as a Key: the same rules apply as to the Key of a
 * GetItem, and an attribute that is not part of the primary key, a missing key
 * element or a type mismatch are refused the same way.
 *
 * It also has to name the item collection the query is reading. A token from
 * another partition names a place this walk never reaches, so it is refused
 * rather than quietly reading from the start.
 */
export function readSimDynamoDbQueryStartKey(
  properties: SimDynamoDbQueryStartKeyProperties,
): SimDynamoDbItem | undefined {
  const { view, keyCondition } = properties;
  const attributeValues = properties.exclusiveStartKey;

  if (attributeValues === undefined) {
    return undefined;
  }

  if (Object.keys(attributeValues).length === 0) {
    throw new SimDynamoDbValidationException(
      "An ExclusiveStartKey names the item to resume after, and this one " +
        "names no attribute at all",
    );
  }

  const startKey = SimDynamoDbItem.fromAttributeValues(attributeValues);

  // Reading the key through the view checks it against the key schema, which
  // is what makes a token DynamoDB would refuse refused here too. A read of an
  // index takes a token carrying the index key and the table key together.
  view.assertStartKey(startKey);

  assertSamePartition(startKey, view, keyCondition);

  return startKey;
}

/**
 * Refuse a token from an item collection other than the one being read.
 */
function assertSamePartition(
  startKey: SimDynamoDbItem,
  view: SimDynamoDbReadView,
  keyCondition: SimDynamoDbKeyCondition,
): void {
  const attributeName = view.keySchema.hashKeyAttributeName;
  const value = startKey.attribute(attributeName);

  assertDefined(
    value,
    `partition key ${attributeName} of an ExclusiveStartKey`,
  );

  if (!simDynamoDbValuesEqual(value, keyCondition.partitionKeyValue)) {
    throw new SimDynamoDbValidationException(
      `The ExclusiveStartKey names the partition key ${attributeName} of a ` +
        `different item collection to the one the KeyConditionExpression reads`,
    );
  }
}
