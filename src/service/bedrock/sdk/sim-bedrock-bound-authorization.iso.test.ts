import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import { invokedAs } from "../../../../test/bedrock/bound-handler.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaHandler } from "../../lambda/function/sim-lambda-handler.type.js";

const region = "eu-west-2";

describe("Bedrock Runtime authorization from a bound Lambda handler", () => {
  it("refuses a call the execution Role is not allowed", async () => {
    // Given a handler that reports the error an invocation fails with.
    const simAws = new SimAws({ defaultRegionName: region });
    const handler: SimLambdaHandler = async () => {
      const client = new BedrockRuntimeClient({ region });
      try {
        await client.send(
          new InvokeModelCommand({
            modelId: "qwen.qwen3-32b-v1:0",
            body: "{}",
          }),
        );
        return { errorName: undefined };
      } catch (error) {
        return {
          errorName: (error as Error).name,
          message: (error as Error).message,
        };
      }
    };

    // When the function runs as a Role allowed something else entirely.
    const answered = (await invokedAs(
      simAws,
      "bedrock:ListFoundationModels",
      handler,
    )) as { errorName: string; message: string };

    // Then Bedrock refused it as the Role, with the exception the SDK names.
    assertIdentical(answered.errorName, "AccessDeniedException");
    assertStringIncludes(answered.message, "bedrock:InvokeModel");

    await simAws.backgroundTasksComplete();
  });
});
