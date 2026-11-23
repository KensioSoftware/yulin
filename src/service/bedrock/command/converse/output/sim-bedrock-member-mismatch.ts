import { isJsonObject, schemaText } from "./sim-bedrock-json-schema.js";
import {
  pointer,
  shown,
  type SchemaObject,
} from "./sim-bedrock-value-mismatch.js";

/**
 * The first defined result of a check over some items.
 */
export function firstFound<T>(
  items: Iterable<T>,
  check: (item: T) => string | undefined,
): string | undefined {
  for (const item of items) {
    const found = check(item);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

/**
 * Where an object lacks a required property, or an array has too few items.
 */
export function memberMismatch(
  value: unknown,
  node: SchemaObject,
  at: string,
): string | undefined {
  const { minItems, required } = node;

  if (
    typeof minItems === "number" &&
    Array.isArray(value) &&
    value.length < minItems
  ) {
    return `${pointer(at)} has ${value.length} items, fewer than ${minItems}`;
  }

  const missing: unknown =
    isJsonObject(value) && Array.isArray(required)
      ? required.find((name) => !Object.hasOwn(value, schemaText(name)))
      : undefined;

  return missing === undefined
    ? undefined
    : `${pointer(at)} is missing the required property ${shown(missing)}`;
}

/**
 * Where a property of an object departs from the schema, checking each
 * declared property with `check` and refusing an undeclared one.
 */
export function objectEntryMismatch(
  value: unknown,
  node: SchemaObject,
  at: string,
  check: (
    member: unknown,
    schema: unknown,
    memberAt: string,
  ) => string | undefined,
): string | undefined {
  const properties = isJsonObject(node["properties"]) ? node["properties"] : {};
  const entries = isJsonObject(value) ? Object.entries(value) : [];

  return firstFound(entries, ([name, member]) =>
    Object.hasOwn(properties, name)
      ? check(
          member,
          Object.getOwnPropertyDescriptor(properties, name)?.value,
          `${at}/${name}`,
        )
      : undefinedPropertyMismatch(node, name, at),
  );
}

function undefinedPropertyMismatch(
  node: SchemaObject,
  name: string,
  at: string,
): string | undefined {
  return node["additionalProperties"] === false
    ? `${pointer(at)} has the property ${shown(name)}, which the schema does not declare`
    : undefined;
}
