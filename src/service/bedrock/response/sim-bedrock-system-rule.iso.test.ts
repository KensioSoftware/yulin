import {
  ConverseCommand,
  ConverseStreamCommand,
  InvokeModelCommand,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimConverseCommandOutput } from "../command/converse/converse.command.js";

const qwen = "qwen.qwen3-235b-a22b-2507-v1:0";

const reviewer = "Review the sentence and answer with a JSON verdict.";

const translator = "Translate the sentence into English.";

/**
 * A one turn conversation sent with the given system blocks.
 */
function askingWith(
  system: SystemContentBlock[],
  prompt = "Review sentence 1042",
): ConverseCommand {
  return new ConverseCommand({
    modelId: qwen,
    system,
    messages: [{ role: "user", content: [{ text: prompt }] }],
  });
}

/**
 * The text of the first content block a Converse response carries.
 */
function answeredText(answered: SimConverseCommandOutput): string {
  const text = answered.output.message.content.at(0)?.text;

  assertNonNullable(text);

  return text;
}

describe("Bedrock system prompt rules", () => {
  it("tells apart two features calling one model", async () => {
    // Given a response declared for each of two system prompts on one model,
    // and one for the model itself.
    const simAws = new SimAws();
    const responses = simAws.bedrock().responses();

    responses.onSystem(reviewer, { text: '{"verdict":"approved"}' });
    responses.onSystem(translator, { text: "The translated sentence." });
    responses.onModel(qwen, { text: "The model answer." });

    // When each feature calls the model with its own instructions.
    const reviewed = await simAws
      .bedrock()
      .converse(askingWith([{ text: reviewer }]));
    const translated = await simAws
      .bedrock()
      .converse(askingWith([{ text: translator }]));

    // Then each gets the response declared for its system prompt.
    assertIdentical(answeredText(reviewed), '{"verdict":"approved"}');
    assertIdentical(answeredText(translated), "The translated sentence.");
  });

  it("answers a different system prompt from the model rule", async () => {
    // Given a response declared for one system prompt and one for the model.
    const simAws = new SimAws();
    const responses = simAws.bedrock().responses();

    responses.onSystem(reviewer, { text: '{"verdict":"approved"}' });
    responses.onModel(qwen, { text: "The model answer." });

    // When the model is called with other instructions, and with none.
    const other = await simAws
      .bedrock()
      .converse(askingWith([{ text: translator }]));
    const bare = await simAws.bedrock().converse(askingWith([]));

    // Then the model rule answers both.
    assertIdentical(answeredText(other), "The model answer.");
    assertIdentical(answeredText(bare), "The model answer.");
  });

  it("lets a prompt rule win over a system rule", async () => {
    // Given a response declared for a system prompt and one for a prompt.
    const simAws = new SimAws();
    const responses = simAws.bedrock().responses();

    responses.onSystem(reviewer, { text: '{"verdict":"approved"}' });
    responses.onPrompt("Review sentence 2071", {
      text: '{"verdict":"rejected"}',
    });

    // When that prompt is sent with that system prompt.
    const answered = await simAws
      .bedrock()
      .converse(askingWith([{ text: reviewer }], "Review sentence 2071"));

    // Then the prompt rule answers it.
    assertIdentical(answeredText(answered), '{"verdict":"rejected"}');
  });

  it("joins system text blocks with a newline and skips a cache point", async () => {
    // Given a response declared for a system prompt written as two lines.
    const simAws = new SimAws();

    simAws.bedrock().responses().onSystem(`${reviewer}\nAnswer in one line.`, {
      text: '{"verdict":"approved"}',
    });

    // When the instructions arrive as two blocks with a cache point between.
    const answered = await simAws
      .bedrock()
      .converse(
        askingWith([
          { text: reviewer },
          { cachePoint: { type: "default" } },
          { text: "Answer in one line." },
        ]),
      );

    // Then the system rule answers it.
    assertIdentical(answeredText(answered), '{"verdict":"approved"}');
  });

  it("answers a streamed conversation from a system rule", async () => {
    // Given a response declared for one system prompt and one for the model.
    const simAws = new SimAws();
    const responses = simAws.bedrock().responses();

    responses.onSystem(translator, {
      chunks: ["The translated ", "sentence."],
    });
    responses.onModel(qwen, { text: "The model answer." });

    // When the conversation is streamed with that system prompt.
    const answered = await simAws.bedrock().converseStream(
      new ConverseStreamCommand({
        modelId: qwen,
        system: [{ text: translator }],
        messages: [{ role: "user", content: [{ text: "Translate 1042" }] }],
      }),
    );
    let accumulated = "";

    for await (const event of answered.stream) {
      accumulated += event.contentBlockDelta?.delta.text ?? "";
    }

    // Then the declared chunks arrive.
    assertIdentical(accumulated, "The translated sentence.");
  });

  it("never matches an InvokeModel request", async () => {
    // Given a response declared for a system prompt and one for the model.
    const simAws = new SimAws();
    const responses = simAws.bedrock().responses();

    responses.onSystem(reviewer, { body: { matched: "system" } });
    responses.onModel(qwen, { body: { matched: "model" } });

    // When the model is invoked with that system prompt inside its body.
    const answered = await simAws.bedrock().invokeModel(
      new InvokeModelCommand({
        modelId: qwen,
        body: JSON.stringify({
          messages: [
            { role: "system", content: reviewer },
            { role: "user", content: "Review sentence 1042" },
          ],
        }),
      }),
    );

    // Then the model rule answers it.
    assertIdentical(
      new TextDecoder().decode(answered.body),
      JSON.stringify({ matched: "model" }),
    );
  });

  it("refuses an empty system prompt", () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a rule is declared for an empty system prompt.
    const error = assertThrowsError(() => {
      simAws.bedrock().responses().onSystem("", { text: "Never matched." });
    });

    // Then it is refused where it was written.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "a system prompt");
  });
});
