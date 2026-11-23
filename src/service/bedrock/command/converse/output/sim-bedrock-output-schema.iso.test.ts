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
 * A conversation asking for a reply shaped by this schema.
 */
function askingFor(schema: unknown): ConverseCommand {
  return new ConverseCommand({
    modelId: qwen,
    messages: [{ role: "user", content: [{ text: "Review entry 1042" }] }],
    outputConfig: {
      textFormat: {
        type: "json_schema",
        structure: {
          jsonSchema: {
            name: "entry_review",
            schema:
              typeof schema === "string" ? schema : JSON.stringify(schema),
          },
        },
      },
    },
  });
}

/**
 * A closed object schema holding these properties, all of them required
 * unless `optional` says otherwise.
 */
function closedObject(
  properties: Readonly<Record<string, unknown>>,
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    properties,
    required: Object.keys(properties).filter(
      (name) => !optional.includes(name),
    ),
    additionalProperties: false,
  };
}

/**
 * The error a Converse call asking for this schema fails with.
 */
async function refusalOf(schema: unknown): Promise<Error> {
  const simAws = new SimAws();

  simAws.bedrock().responses().byDefault({ text: "{}" });

  return await assertThrowsErrorAsync(
    async () => await simAws.bedrock().converse(askingFor(schema)),
  );
}

/**
 * Many string properties named one after another.
 */
function stringProperties(
  count: number,
  type: unknown = "string",
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`field${index}`, { type }]),
  );
}

describe("Bedrock structured output schemas", () => {
  it("accepts a closed object schema and answers with the declared reply", async () => {
    // Given a reply declared for the model.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onModel(qwen, { text: '{"verdict":"approved","reason":"Fine."}' });

    // When a conversation asks for a reply shaped by a closed object schema.
    const answered = await simAws.bedrock().converse(
      askingFor(
        closedObject({
          verdict: { type: "string", enum: ["approved", "rejected"] },
          reason: { type: "string" },
        }),
      ),
    );

    // Then the declared reply comes back.
    assertIdentical(
      answered.output.message.content.at(0)?.text,
      '{"verdict":"approved","reason":"Fine."}',
    );
  });

  it("refuses an object that leaves additionalProperties unset", async () => {
    // When the schema nests an object with additionalProperties unset.
    const error = await refusalOf(
      closedObject({
        entry: { type: "object", properties: { id: { type: "string" } } },
      }),
    );

    // Then Bedrock's validation error names where it is.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "#/properties/entry");
    assertStringIncludes(error.message, "additionalProperties to false");
  });

  it("refuses a schema that is not JSON", async () => {
    // When the schema string does not parse.
    const error = await refusalOf("{type: object}");

    // Then it is refused as invalid.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "is not valid JSON");
  });

  it("refuses the string and number constraints Bedrock does not support", async () => {
    // When the schema carries minLength and maximum.
    const lengthError = await refusalOf(
      closedObject({ reason: { type: "string", minLength: 1 } }),
    );
    const numberError = await refusalOf(
      closedObject({ score: { type: "integer", maximum: 10 } }),
    );

    // Then each is refused by name.
    assertIdentical(lengthError.name, "ValidationException");
    assertStringIncludes(lengthError.message, "uses minLength");
    assertStringIncludes(numberError.message, "uses maximum");
  });

  it("refuses minItems above one", async () => {
    // When an array schema needs two items.
    const error = await refusalOf(
      closedObject({
        tags: { type: "array", items: { type: "string" }, minItems: 2 },
      }),
    );

    // Then it is refused.
    assertStringIncludes(error.message, "Only 0 and 1 are supported");
  });

  it("refuses a pattern with lookaround", async () => {
    // When a string pattern uses a lookahead.
    const error = await refusalOf(
      closedObject({ id: { type: "string", pattern: String.raw`^(?=e)\w+$` } }),
    );

    // Then Bedrock's own message comes back.
    assertIdentical(error.message, "Invalid regex in pattern field.");
  });

  it("follows an internal reference and refuses a recursive one", async () => {
    // Given a schema defining an entry once and referencing it.
    const entry = closedObject({ id: { type: "string" } });
    const simAws = new SimAws();

    simAws.bedrock().responses().byDefault({ text: '{"entry":{"id":"1042"}}' });

    // When it is referenced plainly, and when it references itself.
    const answered = await simAws.bedrock().converse(
      askingFor({
        ...closedObject({ entry: { $ref: "#/$defs/entry" } }),
        $defs: { entry },
      }),
    );
    const error = await refusalOf({
      ...closedObject({ entry: { $ref: "#/$defs/entry" } }),
      $defs: {
        entry: closedObject({ next: { $ref: "#/$defs/entry" } }),
      },
    });

    // Then the plain reference is accepted and the recursive one refused.
    assertIdentical(
      answered.output.message.content.at(0)?.text,
      '{"entry":{"id":"1042"}}',
    );
    assertStringIncludes(error.message, "Recursive schemas are not supported");
  });

  it("refuses an external reference", async () => {
    // When a property refers to another document.
    const error = await refusalOf(
      closedObject({ entry: { $ref: "https://example.com/entry.json" } }),
    );

    // Then it is refused.
    assertStringIncludes(error.message, "Only internal references");
  });

  it("refuses more than twelve optional properties as too complex", async () => {
    // When the schema has thirteen optional properties.
    const properties = stringProperties(13);
    const error = await refusalOf(
      closedObject(properties, Object.keys(properties)),
    );

    // Then Bedrock's message comes back.
    assertIdentical(error.message, "Schema is too complex.");
  });

  it("refuses more than sixteen union-typed properties", async () => {
    // When the schema has seventeen nullable properties.
    const error = await refusalOf(
      closedObject(stringProperties(17, ["string", "null"])),
    );

    // Then it is refused.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "17 union-typed properties");
  });

  it("refuses a keyword Bedrock documents neither way as unsimulated", async () => {
    // When the schema uses oneOf.
    const error = await refusalOf(
      closedObject({ id: { oneOf: [{ type: "string" }] } }),
    );

    // Then it is refused as unsimulated.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "uses oneOf");
  });

  it("refuses a text format other than a JSON schema", async () => {
    // Given a simulated Bedrock with a reply declared.
    const simAws = new SimAws();

    simAws.bedrock().responses().byDefault({ text: "{}" });

    // When the text format names another type.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.bedrock().converse(
          new ConverseCommand({
            modelId: qwen,
            messages: [{ role: "user", content: [{ text: "Anything" }] }],
            outputConfig: {
              textFormat: {
                type: "xml" as "json_schema",
                structure: undefined,
              },
            },
          }),
        ),
    );

    // Then it is refused.
    assertStringIncludes(error.message, "must be json_schema");
  });

  it("refuses an effort level as unsimulated", async () => {
    // Given a simulated Bedrock with a reply declared.
    const simAws = new SimAws();

    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });

    // When a conversation sets an effort level.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.bedrock().converse(
          new ConverseCommand({
            modelId: qwen,
            messages: [{ role: "user", content: [{ text: "Anything" }] }],
            outputConfig: { effort: "high" },
          }),
        ),
    );

    // Then it is refused, naming the option.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(
      error.message,
      "Converse outputConfig effort is not simulated",
    );
  });
});
