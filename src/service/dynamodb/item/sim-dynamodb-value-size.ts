import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

/**
 * Real DynamoDB counts a list or a map as three bytes plus its elements.
 */
const collectionOverhead = 3;

/**
 * The bytes some text counts towards an item's size.
 *
 * DynamoDB counts UTF-8 bytes rather than characters, so an attribute named or
 * valued with anything outside ASCII counts for more than its length.
 */
export function simDynamoDbTextSize(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * The bytes a stored value counts towards its item's size.
 *
 * The figures follow what DynamoDB documents for its 400 KB item limit. They
 * are close rather than exact, as AWS describes them itself, but they are close
 * enough that an item near the limit here is an item near the limit there.
 */
export function simDynamoDbValueSize(value: SimDynamoDbValue): number {
  switch (value.kind) {
    case "S": {
      return simDynamoDbTextSize(value.text);
    }
    case "N": {
      return value.number.sizeInBytes;
    }
    case "B": {
      return value.bytes.byteLength;
    }
    case "BOOL":
    case "NULL": {
      return 1;
    }
    case "SS": {
      return value.texts.reduce(
        (total, text) => total + simDynamoDbTextSize(text),
        0,
      );
    }
    case "NS": {
      return value.numbers.reduce(
        (total, number) => total + number.sizeInBytes,
        0,
      );
    }
    case "BS": {
      return value.bytes.reduce((total, bytes) => total + bytes.byteLength, 0);
    }
    case "L": {
      return value.values.reduce(
        (total, element) => total + simDynamoDbValueSize(element),
        collectionOverhead,
      );
    }
    case "M": {
      return value.entries
        .entries()
        .reduce(
          (total, [name, element]) =>
            total + simDynamoDbTextSize(name) + simDynamoDbValueSize(element),
          collectionOverhead,
        );
    }
  }
}
