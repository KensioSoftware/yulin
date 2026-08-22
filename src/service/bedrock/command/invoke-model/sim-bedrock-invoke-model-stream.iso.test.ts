import { InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimInvokeModelResponseStreamOutput } from "./invoke-model.command.js";

const titan = "amazon.titan-text-express-v1";

/**
 * A streamed invocation carrying a model-specific request body.
 */
function invoking(body: unknown): InvokeModelWithResponseStreamCommand {
  return new InvokeModelWithResponseStreamCommand({
    modelId: titan,
    body: new TextEncoder().encode(JSON.stringify(body)),
  });
}

/**
 * Read a stream the way production code reads one.
 */
async function collected(
  stream: AsyncIterable<SimInvokeModelResponseStreamOutput>,
): Promise<readonly SimInvokeModelResponseStreamOutput[]> {
  const events: SimInvokeModelResponseStreamOutput[] =
    await Array.fromAsync(stream);

  return events;
}

describe("Bedrock InvokeModelWithResponseStream", () => {
  it("streams the declared body as chunk bytes", async () => {
    // Given a response body declared for one model.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onModel(titan, { body: { results: [{ outputText: "Tone sandhi." }] } });

    // When the model is invoked for a stream.
    const answered = await simAws
      .bedrock()
      .invokeModelWithResponseStream(
        invoking({ inputText: "Summarise entry 1042" }),
      );
    const events = await collected(answered.body);

    // Then the body arrives as chunk bytes the caller decodes.
    assertArrayLength(events, 1);

    const chunk = events.at(0)?.chunk;

    assertNonNullable(chunk);
    assertIdentical(
      new TextDecoder().decode(chunk.bytes),
      JSON.stringify({ results: [{ outputText: "Tone sandhi." }] }),
    );
    assertIdentical(answered.contentType, "application/json");
  });

  it("answers from the rules the non-streaming invocation answers from", async () => {
    // Given a body declared for the exact request a caller sends.
    const simAws = new SimAws();
    const request = { inputText: "Summarise entry 1042" };

    simAws
      .bedrock()
      .responses()
      .onPrompt(JSON.stringify(request), { body: { matched: true } });
    simAws
      .bedrock()
      .responses()
      .onModel(titan, { body: { matched: false } });

    // When that body is streamed.
    const answered = await simAws
      .bedrock()
      .invokeModelWithResponseStream(invoking(request));
    const events = await collected(answered.body);

    // Then the prompt rule wins here too.
    const chunk = events.at(0)?.chunk;

    assertNonNullable(chunk);
    assertStringIncludes(
      new TextDecoder().decode(chunk.bytes),
      '"matched":true',
    );
  });

  it("refuses a second reading of a stream", async () => {
    // Given a streamed body that has been read.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({ body: { outputText: "Yes." } });

    const answered = await simAws
      .bedrock()
      .invokeModelWithResponseStream(invoking({ inputText: "Hi" }));

    await collected(answered.body);

    // When it is read again.
    const error = await assertThrowsErrorAsync(
      async () => await collected(answered.body),
    );

    // Then it raises, as a socket read to the end would.
    assertIdentical(error.name, "SimSdkStreamAlreadyConsumedError");
  });

  it("refuses a streamed invocation matching a response with no body", async () => {
    // Given only a Converse response declared.
    const simAws = new SimAws();

    simAws.bedrock().responses().onModel(titan, { text: "Tone sandhi." });

    // When the model is invoked for a stream.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .bedrock()
          .invokeModelWithResponseStream(invoking({ inputText: "Hi" })),
    );

    // Then it says why there is no default to fall back on.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "no default for it");
  });
});
