import {
  ConverseCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

const sonnet = "anthropic.claude-3-5-sonnet-20241022-v2:0";

describe("Bedrock request validation", () => {
  it("refuses a Converse naming a guardrail", async () => {
    // Given a simulated Bedrock with a response declared.
    const simAws = new SimAws();

    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });

    // When a conversation asks for a guardrail to be applied.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.bedrock().converse(
          new ConverseCommand({
            modelId: sonnet,
            messages: [{ role: "user", content: [{ text: "Anything" }] }],
            guardrailConfig: {
              guardrailIdentifier: "entry-guardrail",
              guardrailVersion: "1",
            },
          }),
        ),
    );

    // Then it is refused rather than answered without the guardrail.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "guardrailConfig is not simulated");
  });

  it("refuses an InvokeModel naming a guardrail", async () => {
    // Given a simulated Bedrock with a response body declared.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({ body: { outputText: "Yes." } });

    // When an invocation asks for a guardrail to be applied.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.bedrock().invokeModel(
          new InvokeModelCommand({
            modelId: sonnet,
            body: new TextEncoder().encode("{}"),
            guardrailIdentifier: "entry-guardrail",
          }),
        ),
    );

    // Then it is refused too.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "guardrailIdentifier is not simulated");
  });

  it("accepts the inference parameters a real caller sends", async () => {
    // Given a simulated Bedrock with a response declared.
    const simAws = new SimAws();

    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });

    // When a conversation carries a system prompt and inference settings.
    const answered = await simAws.bedrock().converse(
      new ConverseCommand({
        modelId: sonnet,
        messages: [{ role: "user", content: [{ text: "Anything" }] }],
        system: [{ text: "You summarise entries." }],
        inferenceConfig: { maxTokens: 512, temperature: 0 },
      }),
    );

    // Then they go through, having decided nothing.
    assertIdentical(
      answered.output.message.content.at(0)?.text,
      "Tone sandhi.",
    );
  });

  it("refuses a conversation with no messages", async () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a conversation carries none.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .bedrock()
          .converse(new ConverseCommand({ modelId: sonnet, messages: [] })),
    );

    // Then it is refused as real Bedrock refuses it.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "at least one message");
  });

  it("refuses a request naming no model", async () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a conversation names no model to invoke.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.bedrock().converse(
          new ConverseCommand({
            modelId: "",
            messages: [{ role: "user", content: [{ text: "Anything" }] }],
          }),
        ),
    );

    // Then it says what is missing.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "needs a modelId");
  });
});
