import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";
import { refuseKeyword } from "./sim-bedrock-schema-keyword-names.js";
import { checkPattern } from "./sim-bedrock-schema-pattern.js";
import { checkType } from "./sim-bedrock-schema-type.js";
import { namedTypes, schemaText } from "./sim-bedrock-json-schema.js";

const supportedFormats = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

function isEnumValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function checkEnum(enumerated: unknown, at: string): void {
  if (
    enumerated !== undefined &&
    !(Array.isArray(enumerated) && enumerated.every(isEnumValue))
  ) {
    throw new SimBedrockValidationException(
      `The structured output schema at ${at} has an enum holding something ` +
        `other than strings, numbers, booleans or nulls`,
    );
  }
}

function checkMinItems(minItems: unknown, at: string): void {
  if (minItems !== undefined && minItems !== 0 && minItems !== 1) {
    throw new SimBedrockValidationException(
      `The structured output schema at ${at} sets minItems to ` +
        `${JSON.stringify(minItems)}. Only 0 and 1 are supported.`,
    );
  }
}

function checkFormat(format: unknown, at: string): void {
  if (format !== undefined && !supportedFormats.has(schemaText(format))) {
    throw new SimBedrockValidationException(
      `The structured output schema at ${at} uses the unsupported string ` +
        `format ${JSON.stringify(format)}`,
    );
  }
}

function checkClosedObject(
  node: Readonly<Record<string, unknown>>,
  at: string,
): void {
  const isObject = namedTypes(node).includes("object") || "properties" in node;

  if (isObject && node["additionalProperties"] !== false) {
    throw new SimBedrockValidationException(
      `The structured output schema at ${at} is an object that does not set ` +
        `additionalProperties to false. Every object in a structured output ` +
        `schema must.`,
    );
  }
}

/**
 * Refuse the keywords of one schema node that Bedrock would refuse, and the
 * ones simulated Bedrock cannot check a reply against.
 */
export function checkSchemaKeywords(
  node: Readonly<Record<string, unknown>>,
  at: string,
): void {
  for (const keyword of Object.keys(node)) {
    refuseKeyword(keyword, at);
  }

  checkEnum(node["enum"], at);
  checkMinItems(node["minItems"], at);
  checkFormat(node["format"], at);
  checkPattern(node["pattern"]);
  checkType(node["type"], at);
  checkClosedObject(node, at);
}
