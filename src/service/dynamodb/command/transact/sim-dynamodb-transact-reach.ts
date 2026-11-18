import type { SimDynamoDbProjectionRead } from "../../expression/projection/sim-dynamodb-projection-expression.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { simDynamoDbAttributesOf } from "../authorize/sim-dynamodb-attributes.js";
import { simDynamoDbLeadingKeysOf } from "../authorize/sim-dynamodb-leading-keys.js";
import { simDynamoDbKeyReadSelectKey } from "../authorize/sim-dynamodb-request-keys.js";
import type { SimDynamoDbConditionCheck } from "../item/sim-dynamodb-condition-check.js";
import type { SimDynamoDbTableReach } from "../table/sim-dynamodb-table-reach.js";

/**
 * What one write of a transaction reaches, for the condition keys it is
 * authorized with.
 *
 * AWS authorizes each action of a transaction separately, as the item
 * operation it stands for, with that action's own partition key value. Its
 * attributes are the ones the operation would name: the key or item it
 * carries, its condition, and an update's expression. Its
 * `dynamodb:ReturnValues` is what it asked to see of an item that turned it
 * away, since that is the only item it can return.
 */
export function simDynamoDbTransactKeyReach(
  named: SimDynamoDbItem,
  check: SimDynamoDbConditionCheck,
  expressionAttributes: readonly string[] = [],
): SimDynamoDbTableReach {
  return {
    leadingKeys: simDynamoDbLeadingKeysOf(() => [named]),
    attributes: simDynamoDbAttributesOf(
      expressionAttributes,
      check.attributeNames,
      named.attributeNames(),
    ),
    returnValues: check.returnValuesKey,
  };
}

/**
 * What one Get of a transaction reaches, for the condition keys it is
 * authorized with as a `GetItem`.
 */
export function simDynamoDbTransactGetReach(
  key: SimDynamoDbItem,
  read: SimDynamoDbProjectionRead,
): SimDynamoDbTableReach {
  return {
    leadingKeys: simDynamoDbLeadingKeysOf(() => [key]),
    attributes: simDynamoDbAttributesOf(read.attributes, key.attributeNames()),
    select: simDynamoDbKeyReadSelectKey(read.projection !== undefined),
  };
}
