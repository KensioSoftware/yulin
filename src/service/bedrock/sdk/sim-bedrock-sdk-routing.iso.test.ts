import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

const sonnet = "anthropic.claude-3-5-sonnet-20241022-v2:0";

describe("Bedrock SDK interception", () => {
  it("answers an intercepted BedrockRuntimeClient from declared responses", async () => {
    // Given an intercepted Bedrock Runtime client.
    const simSdk = new SimSdk();
    simSdk.intercept(BedrockRuntimeClient);

    const client = new BedrockRuntimeClient({ region: "eu-west-2" });

    try {
      // And a response declared in the Region it calls.
      simSdk.simAws
        .account()
        .region("eu-west-2")
        .bedrock()
        .responses()
        .onPrompt("Summarise entry 1042", {
          text: "Entry 1042 covers the tone sandhi rules.",
        });

      // When production code converses through the client.
      const answered = await client.send(
        new ConverseCommand({
          modelId: sonnet,
          messages: [
            { role: "user", content: [{ text: "Summarise entry 1042" }] },
          ],
        }),
      );

      // Then the declared response comes back through the SDK's own types.
      assertNonNullable(answered.output);
      assertIdentical(
        answered.output.message?.content?.at(0)?.text,
        "Entry 1042 covers the tone sandhi rules.",
      );
      assertIdentical(answered.stopReason, "end_turn");
    } finally {
      client.destroy();
      simSdk.restoreAll();
    }
  });

  it("answers an intercepted InvokeModel with the declared body", async () => {
    // Given an intercepted Bedrock Runtime client and a declared body.
    const simSdk = new SimSdk();
    simSdk.intercept(BedrockRuntimeClient);

    const client = new BedrockRuntimeClient({ region: "eu-west-2" });

    try {
      simSdk.simAws
        .account()
        .region("eu-west-2")
        .bedrock()
        .responses()
        .byDefault({ body: { results: [{ outputText: "Tone sandhi." }] } });

      // When production code invokes a model through the client.
      const answered = await client.send(
        new InvokeModelCommand({
          modelId: "amazon.titan-text-express-v1",
          body: JSON.stringify({ inputText: "Summarise entry 1042" }),
        }),
      );

      // Then the body decodes the way production code decodes it.
      assertNonNullable(answered.body);
      assertStringIncludes(
        new TextDecoder().decode(answered.body),
        "Tone sandhi.",
      );
    } finally {
      client.destroy();
      simSdk.restoreAll();
    }
  });

  it("refuses a malformed request through the client rather than over the network", async () => {
    // Given an intercepted Bedrock Runtime client.
    const simSdk = new SimSdk();
    simSdk.intercept(BedrockRuntimeClient);

    const client = new BedrockRuntimeClient({ region: "eu-west-2" });

    try {
      // When production code streams a conversation.
      const error = await assertThrowsErrorAsync(
        async () =>
          await client.send(
            new ConverseCommand({
              modelId: sonnet,
              messages: [],
            }),
          ),
      );

      // Then the refusal comes from the simulation, in Bedrock's own terms.
      assertIdentical(error.name, "ValidationException");
    } finally {
      client.destroy();
      simSdk.restoreAll();
    }
  });

  it("supports the Commands its router names and no others", () => {
    // Given a simulated Bedrock.
    const simSdk = new SimSdk();

    // When its router is asked what it handles.
    const supported = simSdk.simAws
      .bedrock()
      .sdkCommandRouter()
      .supportedCommandNames();

    // Then it names the four invocation commands.
    assertArrayEquals(
      supported.toSorted((a, b) => a.localeCompare(b)),
      [
        "ConverseCommand",
        "ConverseStreamCommand",
        "InvokeModelCommand",
        "InvokeModelWithResponseStreamCommand",
      ],
    );
  });
});
