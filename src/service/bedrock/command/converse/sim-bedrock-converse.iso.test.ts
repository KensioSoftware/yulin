import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimConverseCommandOutput } from "./converse.command.js";
import { simBedrockDefaultText } from "../../response/sim-bedrock-response-defaults.js";

const sonnet = "anthropic.claude-3-5-sonnet-20241022-v2:0";

/**
 * A one turn conversation asking the model something.
 */
function askingAbout(prompt: string, modelId = sonnet): ConverseCommand {
  return new ConverseCommand({
    modelId,
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

describe("Bedrock Converse", () => {
  it("answers a conversation from a rule declared for its prompt", async () => {
    // Given a response declared for one prompt.
    const simAws = new SimAws();

    simAws.bedrock().responses().onPrompt("Summarise entry 1042", {
      text: "Entry 1042 covers the tone sandhi rules.",
    });

    // When the model is asked that.
    const answered = await simAws
      .bedrock()
      .converse(askingAbout("Summarise entry 1042"));

    // Then the declared text comes back.
    assertIdentical(
      answeredText(answered),
      "Entry 1042 covers the tone sandhi rules.",
    );
    assertIdentical(answered.stopReason, "end_turn");
  });

  it("answers every other call to a model from its model rule", async () => {
    // Given a response declared for one prompt and one for the model.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onPrompt("Summarise entry 1042", { text: "The declared summary." });
    simAws.bedrock().responses().onModel(sonnet, { text: "The model answer." });

    // When the model is asked something else.
    const answered = await simAws
      .bedrock()
      .converse(askingAbout("Summarise entry 2071"));

    // Then the model rule answers it, and the prompt rule stays for its own
    // prompt.
    const asked = await simAws
      .bedrock()
      .converse(askingAbout("Summarise entry 1042"));

    assertIdentical(answeredText(answered), "The model answer.");
    assertIdentical(answeredText(asked), "The declared summary.");
  });

  it("answers a model no rule names with the built-in default", async () => {
    // Given a response declared for one model.
    const simAws = new SimAws();

    simAws.bedrock().responses().onModel(sonnet, { text: "The model answer." });

    // When another model is asked.
    const answered = await simAws
      .bedrock()
      .converse(askingAbout("Summarise entry 1042", "amazon.nova-pro-v1:0"));

    // Then the default answers, saying what it is.
    assertIdentical(answeredText(answered), simBedrockDefaultText);
  });

  it("matches the last user turn of a longer conversation", async () => {
    // Given a response declared for one prompt.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onPrompt("And entry 2071?", { text: "Entry 2071 covers erhua." });

    // When that prompt arrives at the end of a conversation.
    const answered = await simAws.bedrock().converse(
      new ConverseCommand({
        modelId: sonnet,
        messages: [
          { role: "user", content: [{ text: "Summarise entry 1042" }] },
          { role: "assistant", content: [{ text: "Tone sandhi." }] },
          { role: "user", content: [{ text: "And entry 2071?" }] },
        ],
      }),
    );

    // Then the rule for the last turn answers it.
    assertIdentical(answeredText(answered), "Entry 2071 covers erhua.");
  });

  it("hands back a declared tool use and stops for it", async () => {
    // Given a response declared as a tool call.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({
        content: [
          {
            toolUse: {
              toolUseId: "tooluse-1",
              name: "lookUpEntry",
              input: { entryId: "1042" },
            },
          },
        ],
      });

    // When the model is asked anything.
    const answered = await simAws.bedrock().converse(askingAbout("Anything"));

    // Then the tool call reaches the caller as it was declared, and the stop
    // reason follows it.
    const [block] = answered.output.message.content;

    assertNonNullable(block?.toolUse);
    assertIdentical(block.toolUse.name, "lookUpEntry");
    assertIdentical(answered.stopReason, "tool_use");
  });

  it("reports the token counts a response declares", async () => {
    // Given a response declaring what it cost.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({
        text: "Short.",
        usage: { inputTokens: 7, outputTokens: 3 },
      });

    // When the model is asked anything.
    const answered = await simAws.bedrock().converse(askingAbout("Anything"));

    // Then the counts come back with their total.
    assertIdentical(answered.usage.inputTokens, 7);
    assertIdentical(answered.usage.outputTokens, 3);
    assertIdentical(answered.usage.totalTokens, 10);
  });

  it("refuses a conversation matching a response declared only as a body", async () => {
    // Given a response declared for InvokeModel alone.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onModel(sonnet, { body: { content: [{ text: "Raw." }] } });

    // When Converse reaches it.
    const error = await assertThrowsErrorAsync(
      async () => await simAws.bedrock().converse(askingAbout("Anything")),
    );

    // Then it says which declaration it reached and what it needs.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, `the model '${sonnet}'`);
    assertStringIncludes(error.message, "Declare text or content for Converse");
  });

  it("answers each Region from its own rules", async () => {
    // Given different responses declared in two Regions.
    const simAws = new SimAws();

    simAws
      .account()
      .region("eu-west-2")
      .bedrock()
      .responses()
      .byDefault({ text: "London." });
    simAws
      .account()
      .region("us-east-1")
      .bedrock()
      .responses()
      .byDefault({ text: "Virginia." });

    // When each Region is asked.
    const london = await simAws
      .account()
      .region("eu-west-2")
      .bedrock()
      .converse(askingAbout("Where am I?"));

    // Then it answers with its own.
    assertIdentical(answeredText(london), "London.");
    assertArrayLength(london.output.message.content, 1);
  });
});
