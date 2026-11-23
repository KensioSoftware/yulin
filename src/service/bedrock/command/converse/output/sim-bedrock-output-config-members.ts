import { SimBedrockValidationException } from "../../../error/sim-bedrock.error.js";
import { isJsonObject } from "./sim-bedrock-json-schema.js";

const jsonSchemaType = "json_schema";

/**
 * Read one member of an `outputConfig` as an object, or refuse it.
 */
export function requireObject(
  value: unknown,
  member: string,
): Readonly<Record<string, unknown>> {
  if (!isJsonObject(value)) {
    throw new SimBedrockValidationException(
      `${member} must be an object holding a JSON schema`,
    );
  }

  return value;
}

/**
 * Parse the JSON schema string a structured output request carries.
 */
export function parsedSchema(schema: unknown): unknown {
  if (typeof schema !== "string") {
    throw new SimBedrockValidationException(
      "outputConfig.textFormat.structure.jsonSchema.schema must be a string " +
        "holding a JSON schema",
    );
  }

  try {
    return JSON.parse(schema);
  } catch (error) {
    throw new SimBedrockValidationException(
      `outputConfig.textFormat.structure.jsonSchema.schema is not valid ` +
        `JSON: ${String(error)}`,
    );
  }
}

/**
 * Read the JSON schema definition an `outputConfig.textFormat` carries, or
 * refuse a text format of another type.
 */
export function requireJsonSchema(
  textFormat: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (textFormat["type"] !== jsonSchemaType) {
    throw new SimBedrockValidationException(
      `outputConfig.textFormat.type must be ${jsonSchemaType}`,
    );
  }

  const structure = requireObject(
    textFormat["structure"],
    "outputConfig.textFormat.structure",
  );

  return requireObject(
    structure["jsonSchema"],
    "outputConfig.textFormat.structure.jsonSchema",
  );
}
