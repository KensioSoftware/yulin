import type { SimDynamoDbAttributeValue as SimDynamoDatabaseAttributeValue } from "../command/put-item/put-item.command.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

export type DynamoDBAttrType =
  | boolean
  | null
  | number
  | string
  | Uint8Array
  | Set<string>
  | Set<number>
  | Set<Uint8Array>
  | DynamoDBAttrType[]
  | { [key: string]: DynamoDBAttrType };

/**
 * A single attribute of a DynamoDB Item.
 */
export class DynamoDBItemAttribute {
  constructor(readonly value: DynamoDBAttrType) {}

  /**
   * Convert a DynamoDB AttributeValue structure to a DynamoDBItemAttribute
   * instance.
   */
  static fromAttributeValue(
    value: SimDynamoDatabaseAttributeValue,
  ): DynamoDBItemAttribute {
    if ("BOOL" in value) {
      return new DynamoDBItemAttribute(value.BOOL);
    }
    if ("NULL" in value) {
      return new DynamoDBItemAttribute(null);
    }
    if ("S" in value) {
      return new DynamoDBItemAttribute(value.S);
    }
    if ("N" in value) {
      return new DynamoDBItemAttribute(Number(value.N));
    }
    if ("B" in value) {
      return new DynamoDBItemAttribute(value.B);
    }
    if ("SS" in value) {
      return new DynamoDBItemAttribute(new Set(value.SS));
    }
    if ("NS" in value) {
      return new DynamoDBItemAttribute(new Set(value.NS.map(Number)));
    }
    if ("BS" in value) {
      return new DynamoDBItemAttribute(new Set(value.BS));
    }
    if ("L" in value) {
      return new DynamoDBItemAttribute(
        value.L.map((element) => this.fromAttributeValue(element).value),
      );
    }
    if ("M" in value) {
      return new DynamoDBItemAttribute(
        Object.fromEntries(
          Object.entries(value.M).map(([key, value]) => [
            key,
            this.fromAttributeValue(value).value,
          ]),
        ),
      );
    }
    throw new Error(`Unsupported AttributeValue type: ${jsonStringify(value)}`);
  }

  /**
   * Convert this DynamoDBItemAttribute to a DynamoDB AttributeValue structure.
   */
  toAttributeValue(): SimDynamoDatabaseAttributeValue {
    const value = this.value;

    if (value === null) {
      return { NULL: true };
    }
    if (typeof value === "string") {
      return { S: value };
    }
    if (typeof value === "number") {
      return { N: String(value) };
    }
    if (typeof value === "boolean") {
      return { BOOL: value };
    }
    if (ArrayBuffer.isView(value)) {
      return { B: value };
    }
    if (Array.isArray(value)) {
      return {
        L: value.map((element) => {
          const itemAttribute = new DynamoDBItemAttribute(element);
          return itemAttribute.toAttributeValue();
        }),
      };
    }
    if (value instanceof Set) {
      const firstValue = value.values().next().value;
      if (firstValue !== undefined && ArrayBuffer.isView(firstValue)) {
        return { BS: [...value] as Uint8Array[] };
      }
      if (typeof firstValue === "number") {
        return { NS: [...value].map(String) };
      }
      return { SS: [...value] as string[] };
    }

    return {
      M: Object.fromEntries(
        Object.entries(value).map(([key, value]) => {
          const itemAttribute = new DynamoDBItemAttribute(value);
          return [key, itemAttribute.toAttributeValue()];
        }),
      ),
    };
  }
}
