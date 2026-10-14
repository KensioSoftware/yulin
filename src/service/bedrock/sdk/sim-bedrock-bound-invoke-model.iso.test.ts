import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { invokedAs } from "../../../../test/bedrock/bound-handler.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaHandler } from "../../lambda/function/sim-lambda-handler.type.js";

const region = "eu-west-2";

const qwen = "qwen.qwen3-32b-v1:0";

describe("Bedrock Runtime model invocations from a bound Lambda handler", () => {
  it("answers InvokeModel with the declared body", async () => {
    // Given a declared body for a model named by its inference profile ARN,
    // which travels URL-encoded in the path, and a handler invoking it.
    const simAws = new SimAws({ defaultRegionName: region });
    const profileArn = `arn:aws:bedrock:${region}:111111111111:inference-profile/eu.${qwen}`;
    simAws
      .bedrock()
      .responses()
      .onModel(profileArn, { body: { outputText: "Tone sandhi." } });
    const handler: SimLambdaHandler = async () => {
      const client = new BedrockRuntimeClient({ region });
      const output = await client.send(
        new InvokeModelCommand({
          modelId: profileArn,
          contentType: "application/json",
          body: JSON.stringify({ prompt: "Summarise entry 1042" }),
        }),
      );

      return {
        contentType: output.contentType,
        body: JSON.parse(new TextDecoder().decode(output.body)) as unknown,
      };
    };

    // When the function is invoked.
    const answered = await invokedAs(simAws, "bedrock:InvokeModel", handler);

    // Then the SDK handed the handler the declared body.
    assertObjectEquals(answered, {
      contentType: "application/json",
      body: { outputText: "Tone sandhi." },
    });

    await simAws.backgroundTasksComplete();
  });

  it("streams InvokeModelWithResponseStream chunks the SDK can read", async () => {
    // Given a declared body, and a handler reading an invocation stream.
    const simAws = new SimAws({ defaultRegionName: region });
    simAws
      .bedrock()
      .responses()
      .onModel(qwen, { body: { outputText: "Tone sandhi." } });
    const handler: SimLambdaHandler = async () => {
      const client = new BedrockRuntimeClient({ region });
      const output = await client.send(
        new InvokeModelWithResponseStreamCommand({
          modelId: qwen,
          contentType: "application/json",
          body: JSON.stringify({ prompt: "Summarise entry 1042" }),
        }),
      );

      const events = output.body ?? [];
      let chunks = "";
      for await (const event of events) {
        chunks += new TextDecoder().decode(event.chunk?.bytes);
      }

      return { contentType: output.contentType, chunks };
    };

    // When the function is invoked.
    const answered = (await invokedAs(
      simAws,
      "bedrock:InvokeModel",
      handler,
    )) as { contentType: string; chunks: string };

    // Then the chunks carry the declared answer.
    assertIdentical(answered.contentType, "application/json");
    assertStringIncludes(answered.chunks, "Tone sandhi.");

    await simAws.backgroundTasksComplete();
  });
});
