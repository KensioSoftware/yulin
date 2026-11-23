import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";
import { refuseKeyword } from "./sim-bedrock-schema-keyword-names.js";
import {
  namedTypes,
  schemaPattern,
  schemaText,
} from "./sim-bedrock-json-schema.js";

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

const lookaround = /\(\?<?[!=]/u;
const backreference = /\\[1-9]|\\k</u;

function isEnumValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function compiles(pattern: string): boolean {
  try {
    schemaPattern(pattern);

    return true;
  } catch {
    return false;
  }
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

function checkPattern(pattern: unknown): void {
  if (pattern === undefined) {
    return;
  }

  const source = typeof pattern === "string" ? pattern : "";

  if (
    source.length === 0 ||
    !compiles(source) ||
    lookaround.test(source) ||
    backreference.test(source)
  ) {
    throw new SimBedrockValidationException("Invalid regex in pattern field.");
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
  checkClosedObject(node, at);
}
