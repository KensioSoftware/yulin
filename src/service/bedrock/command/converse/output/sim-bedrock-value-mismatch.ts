import { isDeepStrictEqual } from "node:util";
import {
  isJsonObject,
  namedTypes,
  schemaPattern,
  schemaText,
} from "./sim-bedrock-json-schema.js";

export type SchemaObject = Readonly<Record<string, unknown>>;

/**
 * Where in a reply a value sits, as a JSON pointer. The whole reply is `/`.
 */
export function pointer(at: string): string {
  return at.length === 0 ? "/" : at;
}

/**
 * The value as JSON, for a message.
 */
export function shown(value: unknown): string {
  return JSON.stringify(value);
}

function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case "null": {
      return value === null;
    }
    case "array": {
      return Array.isArray(value);
    }
    case "object": {
      return isJsonObject(value);
    }
    case "integer": {
      // JSON Schema calls any number with no fractional part an integer,
      // including one beyond the safe integer range.
      // oxlint-disable-next-line unicorn-js/prefer-number-is-safe-integer
      return Number.isInteger(value);
    }
    default: {
      return typeof value === type;
    }
  }
}

/**
 * Where a value is not of a type the schema names.
 */
export function typeMismatch(
  value: unknown,
  node: SchemaObject,
  at: string,
): string | undefined {
  const types = namedTypes(node);

  if (types.length === 0 || types.some((type) => hasType(value, type))) {
    return undefined;
  }

  return `${pointer(at)} is ${shown(value)}, which is not of type ${types.join(" or ")}`;
}

/**
 * Where a value is not the `const` or one of the `enum` values the schema names.
 */
export function valueMismatch(
  value: unknown,
  node: SchemaObject,
  at: string,
): string | undefined {
  if ("const" in node && !isDeepStrictEqual(value, node["const"])) {
    return `${pointer(at)} is ${shown(value)}, which is not ${shown(node["const"])}`;
  }

  const { enum: enumerated } = node;

  if (
    Array.isArray(enumerated) &&
    enumerated.every((each) => !isDeepStrictEqual(value, each))
  ) {
    return `${pointer(at)} is ${shown(value)}, which is not one of ${enumerated
      .map((each) => shown(each))
      .join(", ")}`;
  }

  return undefined;
}

/**
 * Where a string does not match the `pattern` the schema names.
 */
export function patternMismatch(
  value: unknown,
  node: SchemaObject,
  at: string,
): string | undefined {
  const { pattern } = node;

  if (
    typeof value !== "string" ||
    typeof pattern !== "string" ||
    schemaPattern(pattern).test(value)
  ) {
    return undefined;
  }

  return `${pointer(at)} is ${shown(value)}, which does not match the pattern ${schemaText(pattern)}`;
}
