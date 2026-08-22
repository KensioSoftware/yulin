import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimInvokeModelCommandOutput } from "./invoke-model.command.js";

const titan = "amazon.titan-text-express-v1";

/**
 * An InvokeModel request carrying a model-specific request body.
 */
function invoking(body: unknown, modelId = titan): InvokeModelCommand {
  return new InvokeModelCommand({
    modelId,
    body: new TextEncoder().encode(JSON.stringify(body)),
  });
}

/**
 * The response body a caller reads back, decoded the way production code
 * decodes it.
 */
function answeredBody(answered: SimInvokeModelCommandOutput): unknown {
  return JSON.parse(new TextDecoder().decode(answered.body));
}

describe("Bedrock InvokeModel", () => {
  it("answers with the body declared for the model", async () => {
    // Given a response body declared for one model.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .onModel(titan, { body: { results: [{ outputText: "Tone sandhi." }] } });

    // When the model is invoked.
    const answered = await simAws
      .bedrock()
      .invokeModel(invoking({ inputText: "Summarise entry 1042" }));

    // Then the declared body comes back as bytes the caller decodes.
    assertIdentical(
      JSON.stringify(answeredBody(answered)),
      JSON.stringify({ results: [{ outputText: "Tone sandhi." }] }),
    );
    assertIdentical(answered.contentType, "application/json");
  });

  it("matches a rule declared for the request body it was sent", async () => {
    // Given a response declared for the exact body a caller sends.
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

    // When that body is sent.
    const answered = await simAws.bedrock().invokeModel(invoking(request));

    // Then the body rule wins over the model rule.
    assertIdentical(
      JSON.stringify(answeredBody(answered)),
      JSON.stringify({ matched: true }),
    );
  });

  it("refuses an invocation matching a response with no body", async () => {
    // Given only a Converse response declared.
    const simAws = new SimAws();

    simAws.bedrock().responses().onModel(titan, { text: "Tone sandhi." });

    // When the model is invoked.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .bedrock()
          .invokeModel(invoking({ inputText: "Summarise entry 1042" })),
    );

    // Then it says why there is no default to fall back on.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "no default for it");
  });

  it("labels the answer as the accept header asked for", async () => {
    // Given a declared response body.
    const simAws = new SimAws();

    simAws
      .bedrock()
      .responses()
      .byDefault({ body: { outputText: "Yes." } });

    // When the caller asks for a content type of its own.
    const body = new TextEncoder().encode(JSON.stringify({ inputText: "Hi" }));
    const answered = await simAws.bedrock().invokeModel(
      new InvokeModelCommand({
        modelId: titan,
        body,
        accept: "application/vnd.amazon.bedrock+json",
      }),
    );

    // Then the answer is labelled with it.
    assertIdentical(
      answered.contentType,
      "application/vnd.amazon.bedrock+json",
    );
  });
});
