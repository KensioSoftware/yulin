import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { readSimDynamoDbValue } from "./sim-dynamodb-value-reader.js";
import {
  simDynamoDbTextSize,
  simDynamoDbValueSize,
} from "./sim-dynamodb-value-size.js";
import { writeSimDynamoDbValue } from "./sim-dynamodb-value-writer.js";
import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

/**
 * Real DynamoDB stops at 400 KB for one item, counting attribute names as well
 * as their values.
 */
const greatestItemBytes = 400 * 1024;

/**
 * One item in a simulated table.
 *
 * An item is its attributes and nothing else: DynamoDB has no schema for
 * anything but the key attributes, so what a request writes is what is held.
 */
export class SimDynamoDbItem {
  private readonly attributes: ReadonlyMap<string, SimDynamoDbValue>;

  private constructor(attributes: ReadonlyMap<string, SimDynamoDbValue>) {
    this.attributes = attributes;
  }

  /**
   * Read an item from the AttributeValues a request carries.
   */
  static fromAttributeValues(
    attributeValues: Readonly<Record<string, SimDynamoDbAttributeValue>>,
  ): SimDynamoDbItem {
    const item = new this(
      new Map(
        Object.entries(attributeValues).map(([name, value]) => [
          name,
          readSimDynamoDbValue(value),
        ]),
      ),
    );

    item.assertWithinSizeLimit();

    return item;
  }

  /**
   * Get one of this item's attributes, if it has it.
   */
  attribute(name: string): SimDynamoDbValue | undefined {
    return this.attributes.get(name);
  }

  /**
   * The attributes this item carries, in the order they arrived.
   */
  attributeNames(): readonly string[] {
    return this.attributes.keys().toArray();
  }

  /**
   * The bytes this item takes up, counting attribute names as DynamoDB does.
   */
  sizeInBytes(): number {
    return this.attributes
      .entries()
      .reduce(
        (total, [name, value]) =>
          total + simDynamoDbTextSize(name) + simDynamoDbValueSize(value),
        0,
      );
  }

  /**
   * Write this item back as the AttributeValues a caller reads.
   */
  toAttributeValues(): Record<string, SimDynamoDbAttributeValue> {
    return Object.fromEntries(
      this.attributes
        .entries()
        .map(([name, value]) => [name, writeSimDynamoDbValue(value)]),
    );
  }

  /**
   * Refuse an item bigger than DynamoDB holds.
   */
  private assertWithinSizeLimit(): void {
    const size = this.sizeInBytes();

    if (size > greatestItemBytes) {
      throw new SimDynamoDbValidationException(
        `Item size has exceeded the maximum allowed size of ` +
          `${greatestItemBytes.toString()} bytes, at ${size.toString()} bytes`,
      );
    }
  }
}
