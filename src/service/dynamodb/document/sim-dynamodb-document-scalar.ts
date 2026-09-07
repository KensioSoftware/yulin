import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { isSimDynamoDbDocumentBinary } from "./sim-dynamodb-document-binary.js";
import type { SimDynamoDbDocumentMarshallOptions } from "./sim-dynamodb-document-marshall-options.js";
import {
  isSimDynamoDbDocumentNumberValue,
  simDynamoDbDocumentNumberAttribute,
} from "./sim-dynamodb-document-number.js";

/**
 * Read a value that stands for one attribute on its own.
 *
 * The kinds are tried in the order the real conversion tries them. A value
 * that is none of them answers with nothing, and what happens to it next is
 * for the caller to decide.
 *
 * An empty string and a binary value holding no bytes are written as NULL when
 * the client was built with `convertEmptyValues`, and as themselves otherwise.
 */
export function simDynamoDbDocumentScalarAttribute(
  value: unknown,
  path: string,
  options: SimDynamoDbDocumentMarshallOptions,
): SimDynamoDbAttributeValue | undefined {
  if (isSimDynamoDbDocumentBinary(value)) {
    return isEmptyLength(value) && options.convertEmptyValues
      ? { NULL: true }
      : { B: value as Uint8Array };
  }

  if (typeof value === "boolean") {
    return { BOOL: value };
  }

  if (typeof value === "number") {
    return simDynamoDbDocumentNumberAttribute(value, path, options);
  }

  if (isSimDynamoDbDocumentNumberValue(value)) {
    return { N: value.toAttributeValue().N };
  }

  if (typeof value === "bigint") {
    return { N: value.toString() };
  }

  if (typeof value === "string") {
    return value.length === 0 && options.convertEmptyValues
      ? { NULL: true }
      : { S: value };
  }

  return undefined;
}

/**
 * Whether a value holds nothing, by the length the real conversion reads.
 *
 * An ArrayBuffer reports `byteLength` rather than `length`, so an empty one is
 * not empty by this measure, and the real conversion leaves it alone too.
 */
function isEmptyLength(value: unknown): boolean {
  return (value as { length?: unknown }).length === 0;
}
