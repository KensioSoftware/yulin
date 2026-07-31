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
   * Hold attributes that have already been read and checked.
   *
   * Nothing is checked again here. It is for building an item out of another
   * item's attributes, such as the part of one a projection asked for, where
   * every value came from an item that was checked on the way in and the
   * result is no bigger than that one.
   */
  static ofAttributes(
    attributes: ReadonlyMap<string, SimDynamoDbValue>,
  ): SimDynamoDbItem {
    return new this(attributes);
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
   * Every attribute this item carries, in the order they arrived.
   */
  entries(): ReadonlyMap<string, SimDynamoDbValue> {
    return this.attributes;
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
