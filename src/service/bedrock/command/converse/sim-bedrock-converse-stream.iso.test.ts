import {
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simBedrockDefaultText } from "../../response/sim-bedrock-response-defaults.js";
import type { SimConverseStreamOutput } from "./converse-stream.command.js";

const sonnet = "anthropic.claude-3-5-sonnet-20241022-v2:0";

/**
 * A one turn conversation asking the model something.
 */
function askingAbout(prompt: string): ConverseStreamCommand {
  return new ConverseStreamCommand({
    modelId: sonnet,
    messages: [{ role: "user", content: [{ text: prompt }] }],
  });
}

/**
 * Read a stream the way production code reads one.
 */
async function collected(
  stream: AsyncIterable<SimConverseStreamOutput>,
): Promise<readonly SimConverseStreamOutput[]> {
  const events: SimConverseStreamOutput[] = await Array.fromAsync(stream);

  return events;
}

/**
 * The kind each event names, in the order they arrived.
 */
function kinds(events: readonly SimConverseStreamOutput[]): readonly string[] {
  return events.flatMap((event) => Object.keys(event));
}

describe("Bedrock ConverseStream", () => {
  it("streams a declared response as the event sequence AWS sends", async () => {
    // Given a response declared for one prompt.
    const simAws = new SimAws();

    simAws.bedrock().responses().onPrompt("Summarise entry 1042", {
      text: "Entry 1042 covers the tone sandhi rules.",
    });

    // When the conversation is streamed.
    const answered = await simAws
      .bedrock()
      .converseStream(askingAbout("Summarise entry 1042"));
    const events = await collected(answered.stream);

    // Then the events arrive in the order real Bedrock sends them.
    assertArrayEquals(kinds(events), [
      "messageStart",
      "contentBlockDelta",
      "contentBlockStop",
      "messageStop",
      "metadata",
    ]);
    assertIdentical(events.at(0)?.messageStart?.role, "assistant");
    assertIdentical(
      events.at(1)?.contentBlockDelta?.delta.text,
      "Entry 1042 covers the tone sandhi rules.",
    );
    assertIdentical(events.at(3)?.messageStop?.stopReason, "end_turn");
  });

  it("sends one delta per declared chunk, in order", async () => {
    // Given a response declared as three chunks.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onPrompt("Summarise entry 1042", {
        chunks: ["Entry 1042 ", "covers the ", "tone sandhi rules."],
      });

    // When the conversation is streamed.
    const answered = await simAws
      .bedrock()
      .converseStream(askingAbout("Summarise entry 1042"));
    const events = await collected(answered.stream);

    // Then each chunk is its own delta, and they carry the text in order.
    assertArrayEquals(
      events
        .map((event) => event.contentBlockDelta?.delta.text)
        .filter((text) => text !== undefined),
      ["Entry 1042 ", "covers the ", "tone sandhi rules."],
    );
  });

  it("answers Converse with the chunks of the same declaration joined", async () => {
    // Given a response declared as chunks.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({ chunks: ["Entry 1042 ", "covers tone sandhi."] });

    // When the non-streaming API asks for it.
    const answered = await simAws.bedrock().converse(
      new ConverseCommand({
        modelId: sonnet,
        messages: [{ role: "user", content: [{ text: "Anything" }] }],
      }),
    );

    // Then one declaration serves both APIs.
    assertIdentical(
      answered.output.message.content.at(0)?.text,
      "Entry 1042 covers tone sandhi.",
    );
  });

  it("sends an undeclared response as a single delta", async () => {
    // Given nothing declared.
    const simAws = new SimAws();

    // When a conversation is streamed.
    const answered = await simAws
      .bedrock()
      .converseStream(askingAbout("Anything"));
    const events = await collected(answered.stream);

    // Then the built-in default arrives whole, in one delta.
    assertArrayEquals(
      events
        .map((event) => event.contentBlockDelta?.delta.text)
        .filter((text) => text !== undefined),
      [simBedrockDefaultText],
    );
  });

  it("announces a tool call before its arguments", async () => {
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

    // When the conversation is streamed.
    const answered = await simAws
      .bedrock()
      .converseStream(askingAbout("What is in entry 1042?"));
    const events = await collected(answered.stream);

    // Then the block opens with the tool's id and name, and the arguments
    // follow as the JSON a real stream sends.
    assertArrayEquals(kinds(events), [
      "messageStart",
      "contentBlockStart",
      "contentBlockDelta",
      "contentBlockStop",
      "messageStop",
      "metadata",
    ]);
    assertIdentical(
      events.at(1)?.contentBlockStart?.start.toolUse.name,
      "lookUpEntry",
    );
    assertIdentical(
      events.at(2)?.contentBlockDelta?.delta.toolUse?.input,
      '{"entryId":"1042"}',
    );
    assertIdentical(events.at(4)?.messageStop?.stopReason, "tool_use");
  });

  it("numbers each content block of a longer response", async () => {
    // Given a response declared as two blocks.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({
        content: [
          { text: "Looking it up." },
          { toolUse: { toolUseId: "tooluse-1", name: "lookUpEntry" } },
        ],
      });

    // When the conversation is streamed.
    const answered = await simAws
      .bedrock()
      .converseStream(askingAbout("Anything"));
    const events = await collected(answered.stream);

    // Then each block carries its own index.
    assertArrayEquals(
      events
        .map(
          (event) =>
            event.contentBlockStop?.contentBlockIndex ??
            event.contentBlockDelta?.contentBlockIndex,
        )
        .filter((index) => index !== undefined),
      [0, 0, 1, 1],
    );
  });

  it("carries a tool call with no arguments as empty JSON", async () => {
    // Given a tool call declared with no input.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({
        content: [{ toolUse: { toolUseId: "tooluse-1", name: "listEntries" } }],
      });

    // When the conversation is streamed.
    const answered = await simAws
      .bedrock()
      .converseStream(askingAbout("Anything"));
    const events = await collected(answered.stream);

    // Then the delta still carries JSON, as a real stream always does.
    assertIdentical(
      events.at(2)?.contentBlockDelta?.delta.toolUse?.input,
      "{}",
    );
  });

  it("reports the token counts in the metadata event", async () => {
    // Given a response declaring what it cost.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({
        text: "Short.",
        usage: { inputTokens: 7, outputTokens: 3 },
      });

    // When the conversation is streamed.
    const answered = await simAws
      .bedrock()
      .converseStream(askingAbout("Anything"));
    const events = await collected(answered.stream);
    const metadata = events.at(-1)?.metadata;

    // Then the counts arrive last, where code metering spend reads them.
    assertNonNullable(metadata);
    assertIdentical(metadata.usage.totalTokens, 10);
    assertIdentical(metadata.metrics.latencyMs, 0);
  });

  it("refuses a second reading of a stream", async () => {
    // Given a streamed response that has been read.
    const simAws = new SimAws();
    const answered = await simAws
      .bedrock()
      .converseStream(askingAbout("Anything"));

    await collected(answered.stream);

    // When it is read again.
    const error = await assertThrowsErrorAsync(
      async () => await collected(answered.stream),
    );

    // Then it raises, as a socket read to the end would.
    assertIdentical(error.name, "SimSdkStreamAlreadyConsumedError");
  });

  it("refuses a stream matching a response declared only as a body", async () => {
    // Given a response declared for InvokeModel alone.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onModel(sonnet, { body: { raw: true } });

    // When ConverseStream reaches it.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.bedrock().converseStream(askingAbout("Anything")),
    );

    // Then it says what to declare, as Converse does.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "Declare text, chunks or content");
  });

  it("refuses a streamed conversation with no messages", async () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a streamed conversation carries none.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .bedrock()
          .converseStream(
            new ConverseStreamCommand({ modelId: sonnet, messages: [] }),
          ),
    );

    // Then the refusal names the operation that was called.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "ConverseStream needs at least one");
  });
});
