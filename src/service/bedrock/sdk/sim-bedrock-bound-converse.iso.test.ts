import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { describe, it } from "vitest";
import { invokedAs } from "../../../../test/bedrock/bound-handler.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaHandler } from "../../lambda/function/sim-lambda-handler.type.js";

const region = "eu-west-2";

const qwen = "qwen.qwen3-32b-v1:0";

const messages = [
  { role: "user" as const, content: [{ text: "Summarise entry 1042" }] },
];

describe("Bedrock Runtime conversations from a bound Lambda handler", () => {
  it("answers Converse with the declared response", async () => {
    // Given a declared answer, and a handler conversing with a model.
    const simAws = new SimAws({ defaultRegionName: region });
    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });
    const handler: SimLambdaHandler = async () => {
      const client = new BedrockRuntimeClient({ region });
      const output = await client.send(
        new ConverseCommand({ modelId: qwen, messages }),
      );

      return {
        stopReason: output.stopReason,
        text: output.output?.message?.content?.at(0)?.text,
      };
    };

    // When the function is invoked as a Role allowed to invoke models.
    const answered = await invokedAs(simAws, "bedrock:InvokeModel", handler);

    // Then the SDK read the simulation's answer.
    assertObjectEquals(answered, {
      stopReason: "end_turn",
      text: "Tone sandhi.",
    });

    await simAws.backgroundTasksComplete();
  });

  it("answers Converse while the simulated clock stands still", async () => {
    // Given a simulation whose clock is frozen, and a handler conversing with
    // a model.
    const simAws = new SimAws({
      defaultRegionName: region,
      clock: new SimFixedClock(new Date("2026-01-01T00:00:00.000Z")),
    });
    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });
    const handler: SimLambdaHandler = async () => {
      const client = new BedrockRuntimeClient({ region });
      const output = await client.send(
        new ConverseCommand({ modelId: qwen, messages }),
      );

      return output.output?.message?.content?.at(0)?.text;
    };

    // When the function is invoked.
    const answered = await invokedAs(simAws, "bedrock:InvokeModel", handler);

    // Then the answer arrives without the clock moving.
    assertIdentical(answered, "Tone sandhi.");

    await simAws.backgroundTasksComplete();
  });

  it("streams ConverseStream events the SDK can read", async () => {
    // Given a declared answer, and a handler reading a conversation stream.
    const simAws = new SimAws({ defaultRegionName: region });
    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });
    const handler: SimLambdaHandler = async () => {
      const client = new BedrockRuntimeClient({ region });
      const output = await client.send(
        new ConverseStreamCommand({ modelId: qwen, messages }),
      );

      const events = output.stream ?? [];
      let text = "";
      let stopReason: string | undefined;
      for await (const event of events) {
        text += event.contentBlockDelta?.delta?.text ?? "";
        stopReason = event.messageStop?.stopReason ?? stopReason;
      }

      return { stopReason, text };
    };

    // When the function is invoked.
    const answered = await invokedAs(simAws, "bedrock:InvokeModel", handler);

    // Then the streamed text adds up to the declared answer.
    assertObjectEquals(answered, {
      stopReason: "end_turn",
      text: "Tone sandhi.",
    });

    await simAws.backgroundTasksComplete();
  });
});
