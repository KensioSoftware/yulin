import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

const region = "eu-west-2";

describe("Bedrock InvokeModelWithResponseStream through SDK interception", () => {
  it("streams the declared body as chunks the caller decodes", async () => {
    // Given an intercepted Bedrock Runtime client and a declared body.
    const simSdk = new SimSdk();
    simSdk.intercept(BedrockRuntimeClient);

    const client = new BedrockRuntimeClient({ region });

    try {
      simSdk.simAws
        .account()
        .region(region)
        .bedrock()
        .responses()
        .byDefault({ body: { outputText: "Tone sandhi." } });

      // When production code reads the chunks.
      const answered = await client.send(
        new InvokeModelWithResponseStreamCommand({
          modelId: "amazon.titan-text-express-v1",
          body: JSON.stringify({ inputText: "Summarise entry 1042" }),
        }),
      );

      const streamed = answered.body ?? [];

      let accumulated = "";

      for await (const event of streamed) {
        accumulated += new TextDecoder().decode(event.chunk?.bytes);
      }

      // Then the bytes decode the way production code decodes them.
      assertStringIncludes(accumulated, "Tone sandhi.");
    } finally {
      client.destroy();
      simSdk.restoreAll();
    }
  });
});
