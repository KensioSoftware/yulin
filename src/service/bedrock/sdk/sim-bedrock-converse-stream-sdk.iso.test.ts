import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

const region = "eu-west-2";

describe("Bedrock ConverseStream through SDK interception", () => {
  it("streams to the code accumulating it", async () => {
    // Given an intercepted Bedrock Runtime client and a chunked response.
    const simSdk = new SimSdk();
    simSdk.intercept(BedrockRuntimeClient);

    const client = new BedrockRuntimeClient({ region });

    try {
      simSdk.simAws
        .account()
        .region(region)
        .bedrock()
        .responses()
        .byDefault({ chunks: ["Entry 1042 ", "covers tone sandhi."] });

      // When production code accumulates the stream.
      const answered = await client.send(
        new ConverseStreamCommand({
          modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
          messages: [{ role: "user", content: [{ text: "Anything" }] }],
        }),
      );

      const streamed = answered.stream ?? [];

      let accumulated = "";

      for await (const event of streamed) {
        accumulated += event.contentBlockDelta?.delta?.text ?? "";
      }

      // Then it reads the whole text through the SDK's own types.
      assertIdentical(accumulated, "Entry 1042 covers tone sandhi.");
    } finally {
      client.destroy();
      simSdk.restoreAll();
    }
  });
});
