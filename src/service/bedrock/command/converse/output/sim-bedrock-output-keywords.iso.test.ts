import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";

const qwen = "qwen.qwen3-32b-v1:0";

/**
 * A conversation asking for a reply shaped by this schema, or carrying this
 * output configuration whole.
 */
function asking(outputConfig: unknown): ConverseCommand {
  return new ConverseCommand({
    modelId: qwen,
    messages: [{ role: "user", content: [{ text: "Review entry 1042" }] }],
    outputConfig: outputConfig as ConverseCommand["input"]["outputConfig"],
  });
}

/**
 * The output configuration asking for this schema.
 */
function schemaFormat(schema: unknown): unknown {
  return {
    textFormat: {
      type: "json_schema",
      structure: {
        jsonSchema: { name: "entry_review", schema: JSON.stringify(schema) },
      },
    },
  };
}

/**
 * The reply a conversation receives where this text is declared and this
 * output configuration is sent.
 */
async function answer(text: string, outputConfig: unknown): Promise<string> {
  const simAws = new SimAws();

  simAws.bedrock().responses().byDefault({ text });

  const answered = await simAws.bedrock().converse(asking(outputConfig));

  return answered.output.message.content.at(0)?.text ?? "";
}

/**
 * The error the same call fails with.
 */
async function refusal(text: string, outputConfig: unknown): Promise<Error> {
  return await assertThrowsErrorAsync(
    async () => await answer(text, outputConfig),
  );
}

describe("Bedrock structured output keywords", () => {
  it.each([
    ["an integer", { type: "integer" }, "42"],
    ["a nullable string", { type: ["string", "null"] }, "null"],
    ["a constant", { const: "approved" }, '"approved"'],
    ["a pattern", { type: "string", pattern: String.raw`^e\d+$` }, '"e1042"'],
    ["an anyOf", { anyOf: [{ type: "number" }, { type: "boolean" }] }, "true"],
    ["an allOf", { allOf: [{ type: "string" }, { enum: ["a", "b"] }] }, '"b"'],
    [
      "an array",
      { type: "array", items: { type: "string" }, minItems: 1 },
      '["tone"]',
    ],
    [
      "a reference",
      { $ref: "#/$defs/id", $defs: { id: { type: "string" } } },
      '"1042"',
    ],
    ["a dated string", { type: "string", format: "date" }, '"2026-11-23"'],
    ["the true schema", true, '{"any":"thing"}'],
    [
      "an integer beyond the safe range",
      { type: "integer" },
      "9007199254740992",
    ],
    [
      "a reference into a list",
      {
        $ref: "#/$defs/choice/anyOf/1",
        $defs: { choice: { anyOf: [{ type: "string" }, { type: "number" }] } },
      },
      "7",
    ],
    [
      "a pattern holding lookaround characters in a class",
      { type: "string", pattern: "^[(?=)]+$" },
      '"(?="',
    ],
  ])("accepts a reply matching %s", async (_, schema, reply) => {
    // When the declared reply matches the schema.
    const answered = await answer(reply, schemaFormat(schema));

    // Then it comes back.
    assertIdentical(answered, reply);
  });

  it.each([
    [{ type: "integer" }, "4.5", "which is not of type integer"],
    [{ type: "string" }, "[1]", "which is not of type string"],
    [{ type: "null" }, "{}", "which is not of type null"],
    [{ const: "approved" }, '"rejected"', 'which is not "approved"'],
    [
      { pattern: String.raw`^e\d+$` },
      '"x1"',
      String.raw`does not match the pattern ^e\d+$`,
    ],
    [
      { anyOf: [{ type: "number" }, { type: "boolean" }] },
      '"x"',
      "matches none of the anyOf schemas",
    ],
    [{ allOf: [{ type: "string" }, { enum: ["a"] }] }, '"b"', "not one of"],
    [{ type: "array", minItems: 1 }, "[]", "has 0 items, fewer than 1"],
    [{ items: { type: "string" } }, '["a",2]', "/1 is 2"],
    [{ $ref: "#/$defs/id", $defs: { id: { type: "string" } } }, "3", "/ is 3"],
    [false, "1", "/ is not allowed"],
  ])("refuses a reply departing from %j", async (schema, reply, mismatch) => {
    // When the declared reply departs from the schema.
    const error = await refusal(reply, schemaFormat(schema));

    // Then the mismatch is named.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, mismatch);
  });

  it.each([
    ["a schema that is a number", 3, "is not a JSON schema"],
    ["an anyOf that is not a list", { anyOf: {} }, "is not a list of schemas"],
    ["an enum holding an object", { enum: [{}] }, "has an enum holding"],
    ["an unsupported format", { format: "color" }, "unsupported string format"],
    ["a pattern that is not text", { pattern: 3 }, "Invalid regex"],
    ["a pattern that does not compile", { pattern: "(" }, "Invalid regex"],
    ["a backreference", { pattern: String.raw`(a)\1` }, "Invalid regex"],
    ["an undefined reference", { $ref: "#/$defs/id" }, "does not define"],
    ["a type that is not a name", { type: 7 }, "not a JSON Schema type"],
    ["a type JSON Schema lacks", { type: "text" }, "not a JSON Schema type"],
    ["an empty type list", { type: [] }, "not a JSON Schema type"],
    [
      "a reference past a list",
      { $ref: "#/$defs/a/5", $defs: { a: [] } },
      "does not define",
    ],
    [
      "a property that is a number",
      { properties: { id: 3 }, additionalProperties: false },
      "#/properties/id",
    ],
  ])("refuses %s", async (_, schema, message) => {
    // When the schema is one Bedrock refuses.
    const error = await refusal("{}", schemaFormat(schema));

    // Then it is refused as invalid.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, message);
  });

  it.each([
    ["an outputConfig that is not an object", "json", "outputConfig must be"],
    [
      "a schema that is not a string",
      {
        textFormat: {
          type: "json_schema",
          structure: { jsonSchema: { schema: {} } },
        },
      },
      "schema must be a string",
    ],
  ])("refuses %s", async (_, outputConfig, message) => {
    // When the output configuration is malformed.
    const error = await refusal("{}", outputConfig);

    // Then it is refused as invalid.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, message);
  });

  it("checks a schema sharing one reference target many times", async () => {
    // Given thirty definitions, each referring twice to the one before.
    const definitions: Record<string, unknown> = { d0: { type: "string" } };

    for (let index = 1; index <= 30; index += 1) {
      const previous = { $ref: `#/$defs/d${index - 1}` };

      definitions[`d${index}`] = { allOf: [previous, previous] };
    }

    // When a reply is checked against the last of them, once matching and
    // once not.
    const format = schemaFormat({ $ref: "#/$defs/d30", $defs: definitions });
    const answered = await answer('"tone"', format);
    const error = await refusal("3", format);

    // Then both finish, each target checked once.
    assertIdentical(answered, '"tone"');
    assertStringIncludes(error.message, "which is not of type string");
  });

  it("answers as usual where outputConfig carries no text format", async () => {
    // When the output configuration is empty.
    const answered = await answer("Plain text.", {});

    // Then the declared text comes back unchecked.
    assertIdentical(answered, "Plain text.");
  });
});
