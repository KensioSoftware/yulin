import {
  SimBedrockUnsimulatedInputException,
  SimBedrockValidationException,
} from "../../../error/sim-bedrock.error.js";

/**
 * The keywords Bedrock documents as supported, and the annotations it reads
 * and ignores.
 */
const supportedKeywords = new Set([
  "type",
  "enum",
  "const",
  "anyOf",
  "allOf",
  "$ref",
  "$defs",
  "definitions",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "format",
  "pattern",
  "description",
  "title",
  "default",
  "examples",
  "$schema",
  "$id",
  "$comment",
]);

/**
 * The keywords Bedrock documents as unsupported, and refuses with a 400.
 */
const refusedKeywords = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
]);

/**
 * Refuse a keyword Bedrock refuses, or one it documents neither way.
 */
export function refuseKeyword(keyword: string, at: string): void {
  if (refusedKeywords.has(keyword)) {
    throw new SimBedrockValidationException(
      `The structured output schema at ${at} uses ${keyword}, which ` +
        `structured outputs does not support`,
    );
  }

  if (!supportedKeywords.has(keyword)) {
    throw new SimBedrockUnsimulatedInputException(
      `The structured output schema at ${at} uses ${keyword}. Bedrock does ` +
        `not document it as supported, and simulated Bedrock does not check ` +
        `replies against it.`,
    );
  }
}
