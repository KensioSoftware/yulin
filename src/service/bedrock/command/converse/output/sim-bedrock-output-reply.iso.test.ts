import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type OutputConfig,
} from "@aws-sdk/client-bedrock-runtime";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimSdk } from "../../../../../sdk/index.js";
import type { SimBedrockDeclaredResponse } from "../../../response/sim-bedrock-response-declaration.js";

const qwen = "qwen.qwen3-32b-v1:0";

const reviewSchema = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["approved", "rejected"] },
    reason: { type: "string" },
  },
  required: ["verdict", "reason"],
  additionalProperties: false,
};

const reviewFormat: OutputConfig = {
  textFormat: {
    type: "json_schema",
    structure: {
      jsonSchema: {
        name: "entry_review",
        schema: JSON.stringify(reviewSchema),
      },
    },
  },
};

const messages = [{ role: "user" as const, content: [{ text: "Review it" }] }];

/**
 * A conversation asking for an entry review.
 */
function askingForReview(): ConverseCommand {
  return new ConverseCommand({
    modelId: qwen,
    messages,
    outputConfig: reviewFormat,
  });
}

/**
 * The error an entry review fails with when this reply is declared.
 */
async function refusalOf(reply: SimBedrockDeclaredResponse): Promise<Error> {
  const simAws = new SimAws();

  simAws.bedrock().responses().onModel(qwen, reply);

  return await assertThrowsErrorAsync(
    async () => await simAws.bedrock().converse(askingForReview()),
  );
}

describe("Bedrock structured output replies", () => {
  it("refuses a declared reply that is not JSON", async () => {
    // When the declared reply is the invalid JSON a model once sent.
    const error = await refusalOf({ text: '{"verdict": "approved", ""}' });

    // Then it is refused as a declaration Bedrock could never answer with.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "entry_review");
    assertStringIncludes(error.message, "the model 'qwen.qwen3-32b-v1:0'");
    assertStringIncludes(error.message, "its text is not JSON");
  });

  it("names a value outside the enum", async () => {
    // When the declared verdict is not one the schema lists.
    const error = await refusalOf({
      text: '{"verdict":"maybe","reason":"Unsure."}',
    });

    // Then the mismatch names the property and the allowed values.
    assertStringIncludes(
      error.message,
      '/verdict is "maybe", which is not one of "approved", "rejected"',
    );
  });

  it("names a missing required property", async () => {
    // When the declared reply leaves out the reason.
    const error = await refusalOf({ text: '{"verdict":"approved"}' });

    // Then the mismatch names it.
    assertStringIncludes(
      error.message,
      'missing the required property "reason"',
    );
  });

  it("names a property the schema does not declare", async () => {
    // When the declared reply carries an extra property.
    const error = await refusalOf({
      text: '{"verdict":"approved","reason":"Fine.","score":3}',
    });

    // Then the mismatch names it.
    assertStringIncludes(error.message, 'has the property "score"');
  });

  it("refuses the built-in default for a structured output request", async () => {
    // Given no reply declared.
    const simAws = new SimAws();

    // When an entry review is asked for.
    const error = await assertThrowsErrorAsync(
      async () => await simAws.bedrock().converse(askingForReview()),
    );

    // Then the built-in default text is refused, saying where it came from.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "(the built-in default)");
  });

  it("lets a reply stopped at the token limit carry incomplete JSON", async () => {
    // Given a truncated reply declared as stopping at the token limit.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onModel(qwen, { text: '{"verdict":"appr', stopReason: "max_tokens" });

    // When an entry review is asked for.
    const answered = await simAws.bedrock().converse(askingForReview());

    // Then the truncated reply comes back, as it does on Bedrock.
    assertIdentical(answered.stopReason, "max_tokens");
    assertIdentical(
      answered.output.message.content.at(0)?.text,
      '{"verdict":"appr',
    );
  });

  it("leaves a reply holding only a tool call unchecked", async () => {
    // Given a reply declared as a tool call.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onModel(qwen, {
        content: [{ toolUse: { toolUseId: "t-1", name: "lookUpEntry" } }],
      });

    // When an entry review is asked for.
    const answered = await simAws.bedrock().converse(askingForReview());

    // Then the tool call comes back.
    assertIdentical(answered.stopReason, "tool_use");
  });

  it("checks a streamed reply joined from its chunks", async () => {
    // Given a conforming reply and a nonconforming one, each in chunks.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onPrompt("Review it", {
        chunks: ['{"verdict":"rejected",', '"reason":"Off topic."}'],
      });
    simAws
      .bedrock()
      .responses()
      .onPrompt("Review that", {
        chunks: ['{"verdict":', '"maybe","reason":"Unsure."}'],
      });

    // When each is streamed.
    const answered = await simAws.bedrock().converseStream(
      new ConverseStreamCommand({
        modelId: qwen,
        messages,
        outputConfig: reviewFormat,
      }),
    );
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.bedrock().converseStream(
          new ConverseStreamCommand({
            modelId: qwen,
            messages: [{ role: "user", content: [{ text: "Review that" }] }],
            outputConfig: reviewFormat,
          }),
        ),
    );

    // Then the conforming one streams and the other is refused.
    let accumulated = "";

    for await (const event of answered.stream) {
      accumulated += event.contentBlockDelta?.delta.text ?? "";
    }

    assertIdentical(
      accumulated,
      '{"verdict":"rejected","reason":"Off topic."}',
    );
    assertStringIncludes(error.message, "A ConverseStream call");
    assertStringIncludes(error.message, '/verdict is "maybe"');
  });

  it("answers a structured output request through SDK interception", async () => {
    // Given an intercepted client and a conforming reply.
    const simSdk = new SimSdk();
    simSdk.intercept(BedrockRuntimeClient);

    const client = new BedrockRuntimeClient({ region: "eu-west-2" });

    try {
      simSdk.simAws
        .account()
        .region("eu-west-2")
        .bedrock()
        .responses()
        .byDefault({ text: '{"verdict":"approved","reason":"Fine."}' });

      // When production code asks for an entry review.
      const answered = await client.send(askingForReview());

      // Then it parses the reply it was promised.
      const reply: unknown = JSON.parse(
        answered.output?.message?.content?.at(0)?.text ?? "",
      );

      assertIdentical(
        JSON.stringify(reply),
        '{"verdict":"approved","reason":"Fine."}',
      );
    } finally {
      client.destroy();
      simSdk.restoreAll();
    }
  });
});
