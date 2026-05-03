import type { AttributeValue } from "@aws-sdk/client-dynamodb";

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
  static fromAttributeValue(value: AttributeValue): DynamoDBItemAttribute {
    if (value.BOOL !== undefined) {
      return new DynamoDBItemAttribute(value.BOOL);
    }
    if (value.NULL !== undefined) {
      return new DynamoDBItemAttribute(null);
    }
    if (value.S !== undefined) {
      return new DynamoDBItemAttribute(value.S);
    }
    if (value.N !== undefined) {
      return new DynamoDBItemAttribute(Number(value.N));
    }
    if (value.B !== undefined) {
      return new DynamoDBItemAttribute(value.B);
    }
    if (value.SS !== undefined) {
      return new DynamoDBItemAttribute(new Set(value.SS));
    }
    if (value.NS !== undefined) {
      return new DynamoDBItemAttribute(new Set(value.NS.map(Number)));
    }
    if (value.BS !== undefined) {
      return new DynamoDBItemAttribute(new Set(value.BS));
    }
    if (value.L !== undefined) {
      return new DynamoDBItemAttribute(
        value.L.map((el) => DynamoDBItemAttribute.fromAttributeValue(el).value),
      );
    }
    if (value.M !== undefined) {
      return new DynamoDBItemAttribute(
        Object.fromEntries(
          Object.entries(value.M).map(([key, val]) => [
            key,
            DynamoDBItemAttribute.fromAttributeValue(val).value,
          ]),
        ),
      );
    }
    throw new Error(
      `Unsupported AttributeValue type: ${JSON.stringify(value)}`,
    );
  }

  /**
   * Convert this DynamoDBItemAttribute to a DynamoDB AttributeValue structure.
   */
  toAttributeValue(): AttributeValue {
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
        L: value.map((el) => new DynamoDBItemAttribute(el).toAttributeValue()),
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
        Object.entries(value).map(([key, val]) => [
          key,
          new DynamoDBItemAttribute(val).toAttributeValue(),
        ]),
      ),
    };
  }
}
