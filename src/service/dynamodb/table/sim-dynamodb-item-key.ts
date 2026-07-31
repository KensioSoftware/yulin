import { assertDefined } from "../../../util/type-guard/defined.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import type { DynamoDBAttributeType } from "../item/dynamodb-item-attribute.js";
import type { DynamoDbItem } from "../item/dynamodb-item.js";

type DynamoDbKey = number | string;

/**
 * Check if a given value can be used as a DynamoDB partition key or sort key.
 */
function canBeDynamoDbKey(value: DynamoDBAttributeType): value is DynamoDbKey {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Reads the primary key of an item, following a table's key schema.
 *
 * The key is serialized as JSON and used as the internal item map key, so two
 * items with the same partition and sort key values are the same item.
 */
export class SimDynamoDbItemKey {
  private readonly hashKeyAttributeName: string;
  private readonly rangeKeyAttributeName: string | undefined;

  constructor(
    hashKeyAttributeName: string,
    rangeKeyAttributeName: string | undefined,
  ) {
    this.hashKeyAttributeName = hashKeyAttributeName;
    this.rangeKeyAttributeName = rangeKeyAttributeName;
  }

  /**
   * Make the primary key string for an item.
   */
  of(item: DynamoDbItem): string {
    const partitionKey = this.partitionKeyValue(item);

    if (this.rangeKeyAttributeName === undefined) {
      return jsonStringify({ [this.hashKeyAttributeName]: partitionKey });
    }

    return jsonStringify({
      [this.hashKeyAttributeName]: partitionKey,
      [this.rangeKeyAttributeName]: this.sortKeyValue(
        item,
        this.rangeKeyAttributeName,
      ),
    });
  }

  /**
   * Read an item's partition key value.
   */
  private partitionKeyValue(item: DynamoDbItem): DynamoDbKey {
    const attribute = item.attribute(this.hashKeyAttributeName);
    assertDefined(
      attribute,
      `DynamoDB Item partition key ${this.hashKeyAttributeName} required`,
    );

    if (!canBeDynamoDbKey(attribute.value)) {
      throw new TypeError(
        `DynamoDB Item partition key ${this.hashKeyAttributeName} must be string or number`,
      );
    }

    return attribute.value;
  }

  /**
   * Read an item's sort key value.
   */
  private sortKeyValue(item: DynamoDbItem, attributeName: string): DynamoDbKey {
    const attribute = item.attribute(attributeName);
    if (attribute === undefined) {
      throw new TypeError(
        `DynamoDB Item sort key ${attributeName} is undefined`,
      );
    }
    if (!canBeDynamoDbKey(attribute.value)) {
      throw new TypeError(
        `DynamoDB Item sort key ${attributeName} must be string or number`,
      );
    }

    return attribute.value;
  }
}
