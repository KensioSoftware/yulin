import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";

const typeNames = new Set([
  "object",
  "array",
  "string",
  "integer",
  "number",
  "boolean",
  "null",
]);

function isTypeName(value: unknown): boolean {
  return typeof value === "string" && typeNames.has(value);
}

/**
 * Refuse a `type` that is neither a type name nor a non-empty list of them.
 * A schema leaving `type` out accepts any type.
 */
export function checkType(type: unknown, at: string): void {
  const named = Array.isArray(type) ? type : [type];

  if (type !== undefined && (named.length === 0 || !named.every(isTypeName))) {
    throw new SimBedrockValidationException(
      `The structured output schema at ${at} declares the type ` +
        `${JSON.stringify(type)}, which is not a JSON Schema type`,
    );
  }
}
