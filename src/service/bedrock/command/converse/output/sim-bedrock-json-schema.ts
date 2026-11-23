import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";

/**
 * One schema in a structured output JSON schema.
 *
 * JSON Schema allows `true` and `false` as schemas (`true` accepts any value
 * and `false` accepts none), so a node is either one of those or an object of
 * keywords.
 */
export type SimBedrockSchemaNode = boolean | Readonly<Record<string, unknown>>;

/**
 * Whether a value is a JSON object (an array is excluded).
 */
export function isJsonObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read a value as a schema node, or refuse it as Bedrock would.
 */
export function schemaNode(value: unknown, at: string): SimBedrockSchemaNode {
  if (typeof value === "boolean" || isJsonObject(value)) {
    return value;
  }

  throw new SimBedrockValidationException(
    `The structured output schema at ${at} is not a JSON schema`,
  );
}

/**
 * A schema value written as text for a message or a lookup.
 */
export function schemaText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * The regular expression a schema `pattern` holds.
 *
 * The pattern comes from the request, as it does on Bedrock, which compiles
 * it into the grammar that constrains the model.
 */
export function schemaPattern(pattern: string): RegExp {
  // oxlint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(pattern, "u");
}

/**
 * The types a schema node names in `type`, as a list.
 */
export function namedTypes(
  node: Readonly<Record<string, unknown>>,
): readonly string[] {
  const { type } = node;

  if (typeof type === "string") {
    return [type];
  }

  return Array.isArray(type)
    ? type.filter((each): each is string => typeof each === "string")
    : [];
}

function unescapedPointerToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

/**
 * Resolve an internal `$ref` against the root schema.
 *
 * Only references into the same document (`#` and `#/...`) resolve. Bedrock
 * refuses an external reference, and so does this.
 */
export function resolveSchemaRef(
  root: SimBedrockSchemaNode,
  ref: string,
): SimBedrockSchemaNode {
  if (ref !== "#" && !ref.startsWith("#/")) {
    throw new SimBedrockValidationException(
      `The structured output schema references ${ref}. Only internal ` +
        `references are supported.`,
    );
  }

  let resolved: unknown = root;

  for (const token of ref.split("/").slice(1)) {
    resolved = isJsonObject(resolved)
      ? resolved[unescapedPointerToken(token)]
      : undefined;
  }

  if (resolved === undefined) {
    throw new SimBedrockValidationException(
      `The structured output schema references ${ref}, which it does not ` +
        `define`,
    );
  }

  return schemaNode(resolved, ref);
}
