import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";
import { isSimDynamoDbDocumentBinary } from "./sim-dynamodb-document-binary.js";
import {
  isSimDynamoDbDocumentNumberValue,
  simDynamoDbDocumentNumberAttribute,
} from "./sim-dynamodb-document-number.js";
import { simDynamoDbDocumentSetAttribute } from "./sim-dynamodb-document-set.js";

/**
 * Read a native JavaScript value as the AttributeValue it stands for.
 *
 * This is the conversion the document client does in middleware, which an
 * intercepted send never reaches. The rules are the real ones, in the real
 * order, so a value that reaches a simulated table through the document client
 * is the value that would have reached the real one.
 *
 * `undefined` is refused rather than dropped. The real document client drops it
 * when the client was built with `removeUndefinedValues`, which is a translate
 * config this simulation does not read yet, so refusing is what keeps a test
 * from passing against an item AWS would have written differently.
 */
export function simDynamoDbDocumentAttributeValue(
  value: unknown,
  path: string,
): SimDynamoDbAttributeValue {
  if (value === undefined) {
    throw new SimDynamoDbDocumentValueError(
      `${path} is undefined. The real document client drops it only when it ` +
        `was built with removeUndefinedValues, which simulated DynamoDB does ` +
        `not read yet, so leave the attribute out instead`,
    );
  }

  if (value === null) {
    return { NULL: true };
  }

  if (Array.isArray(value)) {
    return { L: listMembers(value, path) };
  }

  return containerOrScalar(value, path);
}

/**
 * Read a value that is not null, undefined or a list.
 */
function containerOrScalar(
  value: unknown,
  path: string,
): SimDynamoDbAttributeValue {
  if (value instanceof Set) {
    return simDynamoDbDocumentSetAttribute(value, path);
  }

  if (value instanceof Map) {
    return { M: mapEntries([...value], path) };
  }

  if (isPlainObject(value)) {
    return { M: mapEntries(Object.entries(value), path) };
  }

  return scalar(value, path);
}

/**
 * Read a value that stands for one attribute on its own.
 */
function scalar(value: unknown, path: string): SimDynamoDbAttributeValue {
  if (isSimDynamoDbDocumentBinary(value)) {
    return { B: value as Uint8Array };
  }

  if (typeof value === "boolean") {
    return { BOOL: value };
  }

  if (typeof value === "number") {
    return simDynamoDbDocumentNumberAttribute(value, path);
  }

  if (isSimDynamoDbDocumentNumberValue(value)) {
    return { N: value.toAttributeValue().N };
  }

  if (typeof value === "bigint") {
    return { N: value.toString() };
  }

  if (typeof value === "string") {
    return { S: value };
  }

  throw new SimDynamoDbDocumentValueError(
    `${path} is a ${typeof value} the document client has no attribute type ` +
      `for`,
  );
}

/**
 * The members of a list, with the functions left out as the real one leaves
 * them out.
 */
function listMembers(
  values: readonly unknown[],
  path: string,
): SimDynamoDbAttributeValue[] {
  return values
    .filter((member) => typeof member !== "function")
    .map((member, index) =>
      simDynamoDbDocumentAttributeValue(member, `${path}[${index.toString()}]`),
    );
}

/**
 * The entries of a map, with the functions left out.
 */
function mapEntries(
  entries: readonly (readonly [unknown, unknown])[],
  path: string,
): Record<string, SimDynamoDbAttributeValue> {
  const attributes: Record<string, SimDynamoDbAttributeValue> = {};

  for (const [name, member] of entries) {
    if (typeof member === "function") {
      continue;
    }

    const key = String(name);

    // Defined rather than assigned, so an attribute named `__proto__` becomes
    // an ordinary attribute instead of reaching the prototype setter. The real
    // document client assigns, and so loses that attribute.
    Object.defineProperty(attributes, key, {
      value: simDynamoDbDocumentAttributeValue(member, `${path}.${key}`),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return attributes;
}

/**
 * Whether a value is an object the document client reads as a map.
 *
 * A class instance is not one. The real document client refuses it unless it
 * was built with `convertClassInstanceToMap`, so an object with behaviour is
 * not quietly flattened into attributes.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object") {
    return false;
  }

  const name = (value as { constructor?: { name?: string } }).constructor?.name;

  return name === "Object" || name === undefined;
}
