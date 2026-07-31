import { DynamoDBItemAttribute } from "./dynamodb-item-attribute.js";
import type { SimDynamoDbAttributeValue as SimDynamoDatabaseAttributeValue } from "../command/put-item/put-item.command.js";

/**
 * A single Item in a DynamoDB Table.
 */
export class DynamoDbItem {
  constructor(
    readonly attributes: Record<string, DynamoDBItemAttribute> = {},
  ) {}

  /**
   * Convert an AttributeValue structure to a DynamoDbItem instance.
   */
  static fromAttributeValues(
    attributeValues: Record<string, SimDynamoDatabaseAttributeValue>,
  ): DynamoDbItem {
    return new DynamoDbItem(
      Object.fromEntries(
        Object.entries(attributeValues).map(([key, value]) => [
          key,
          DynamoDBItemAttribute.fromAttributeValue(value),
        ]),
      ),
    );
  }

  /**
   * Get one of this item's attributes, if it has it.
   */
  attribute(name: string): DynamoDBItemAttribute | undefined {
    // An item is keyed by whatever attribute names it was written with, so the
    // lookup is by a name the caller supplies rather than a fixed one.
    return this.attributes[name];
  }

  /**
   * Convert this DynamoDbItem to an AttributeValue structure.
   */
  toAttributeValues(): Record<string, SimDynamoDatabaseAttributeValue> {
    return Object.fromEntries(
      Object.entries(this.attributes).map(([key, value]) => [
        key,
        value.toAttributeValue(),
      ]),
    );
  }
}
