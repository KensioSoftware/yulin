import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";
import {
  isJsonObject,
  namedTypes,
  type SimBedrockSchemaNode,
} from "./sim-bedrock-json-schema.js";

const maxOptionalProperties = 12;
const maxUnionProperties = 16;

/**
 * Refuse a schema over the property limits Bedrock documents.
 *
 * Bedrock counts optional properties across every nested object, and refuses
 * more than 12 with this message. It refuses more than 16 properties typed as
 * a union, by a type list or an `anyOf`.
 */
export function refuseOverLimits(
  optionalProperties: number,
  unionProperties: number,
): void {
  if (optionalProperties > maxOptionalProperties) {
    throw new SimBedrockValidationException("Schema is too complex.");
  }

  if (unionProperties > maxUnionProperties) {
    throw new SimBedrockValidationException(
      `The structured output schema has ${unionProperties} union-typed ` +
        `properties. At most ${maxUnionProperties} are supported.`,
    );
  }
}

/**
 * Whether a property is typed as a union, by a type list or an `anyOf`.
 */
export function isUnion(node: SimBedrockSchemaNode): boolean {
  return isJsonObject(node) && (namedTypes(node).length > 1 || "anyOf" in node);
}

/**
 * The schemas an `anyOf` or `allOf` lists, or none where it is absent.
 */
export function subschemas(value: unknown, at: string): readonly unknown[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new SimBedrockValidationException(
      `The structured output schema at ${at} is not a list of schemas`,
    );
  }

  return value;
}
