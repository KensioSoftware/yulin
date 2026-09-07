import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";
import type { SimDynamoDbDocumentMarshallOptions } from "./sim-dynamodb-document-marshall-options.js";
import { simDynamoDbDocumentScalarAttribute } from "./sim-dynamodb-document-scalar.js";
import { simDynamoDbDocumentSetAttribute } from "./sim-dynamodb-document-set.js";

/**
 * Read a native JavaScript value as the AttributeValue it stands for.
 *
 * This is the conversion the document client does in middleware, which an
 * intercepted send never reaches. The rules are the real ones, in the real
 * order, so a value that reaches a simulated table through the document client
 * is the value that would have reached the real one.
 *
 * The options are the ones the document client was built with. They decide
 * what happens to a value the defaults refuse: an undefined member, an empty
 * string or binary value, a class instance, and a number past the range a
 * JavaScript number holds exactly.
 */
export function simDynamoDbDocumentAttributeValue(
  value: unknown,
  path: string,
  options: SimDynamoDbDocumentMarshallOptions,
): SimDynamoDbAttributeValue {
  if (value === undefined) {
    throw new SimDynamoDbDocumentValueError(
      `${path} is undefined. Build the document client with ` +
        `removeUndefinedValues to drop it, which is what the real one asks ` +
        `for, or leave the attribute out instead`,
    );
  }

  if (value === null) {
    return { NULL: true };
  }

  if (Array.isArray(value)) {
    return { L: listMembers(value, path, options) };
  }

  return containerOrScalar(value, path, options);
}

/**
 * Read a value that is not null, undefined or a list.
 */
function containerOrScalar(
  value: unknown,
  path: string,
  options: SimDynamoDbDocumentMarshallOptions,
): SimDynamoDbAttributeValue {
  if (value instanceof Set) {
    return simDynamoDbDocumentSetAttribute(value, path, options);
  }

  if (value instanceof Map) {
    return { M: mapEntries([...value], path, options) };
  }

  if (isPlainObject(value)) {
    return { M: mapEntries(Object.entries(value), path, options) };
  }

  const scalar = simDynamoDbDocumentScalarAttribute(value, path, options);
  if (scalar !== undefined) {
    return scalar;
  }

  // A class instance is read as a map only when the client asked for it, which
  // is the last thing the real conversion tries before giving up. Null reached
  // an answer of its own before any of this.
  if (typeof value === "object" && options.convertClassInstanceToMap) {
    const instance = value as Record<string, unknown>;
    return { M: mapEntries(Object.entries(instance), path, options) };
  }

  throw new SimDynamoDbDocumentValueError(
    `${path} is a ${typeof value} the document client has no attribute type ` +
      `for`,
  );
}

/**
 * The members of a list, with the functions left out as the real one leaves
 * them out.
 *
 * A dropped undefined member takes its position with it, so the members after
 * it move up. That is what the real conversion does: it filters before it
 * converts, rather than writing a NULL where the member was.
 */
function listMembers(
  values: readonly unknown[],
  path: string,
  options: SimDynamoDbDocumentMarshallOptions,
): SimDynamoDbAttributeValue[] {
  return values
    .filter(
      (member) =>
        typeof member !== "function" &&
        !(member === undefined && options.removeUndefinedValues),
    )
    .map((member, index) =>
      simDynamoDbDocumentAttributeValue(
        member,
        `${path}[${index.toString()}]`,
        options,
      ),
    );
}

/**
 * The entries of a map, with the functions left out.
 */
function mapEntries(
  entries: readonly (readonly [unknown, unknown])[],
  path: string,
  options: SimDynamoDbDocumentMarshallOptions,
): Record<string, SimDynamoDbAttributeValue> {
  const attributes: Record<string, SimDynamoDbAttributeValue> = {};

  for (const [name, member] of entries) {
    if (typeof member === "function") {
      continue;
    }

    if (member === undefined && options.removeUndefinedValues) {
      continue;
    }

    const key = String(name);

    // Defined rather than assigned, so an attribute named `__proto__` becomes
    // an ordinary attribute instead of reaching the prototype setter. The real
    // document client assigns, and so loses that attribute.
    Object.defineProperty(attributes, key, {
      value: simDynamoDbDocumentAttributeValue(
        member,
        `${path}.${key}`,
        options,
      ),
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
