import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdkWireDispatcher } from "../../../sdk/wire/sim-sdk-wire-dispatcher.js";
import { SimAws } from "../../aws/sim-aws.js";

const region = "eu-west-2";

describe("Bedrock over the wire path", () => {
  it("refuses a serialized Bedrock request rather than answering it unframed", async () => {
    // Given a simulation reached through the wire path, as a function bundling
    // its own SDK reaches it.
    const simAws = new SimAws({ defaultRegionName: region });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When a serialized ConverseStream request arrives.
    const error = await assertThrowsErrorAsync(
      async () =>
        await dispatcher.dispatch({
          method: "POST",
          hostname: `bedrock-runtime.${region}.amazonaws.com`,
          path: "/model/anthropic.claude-3-5-sonnet-20241022-v2:0/converse-stream",
          headers: Object.fromEntries([
            ["content-type", "application/json"],
            [
              "authorization",
              `AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE/20260822/${region}/` +
                "bedrock/aws4_request, SignedHeaders=host, Signature=abc123",
            ],
          ]),
          body: Buffer.from("{}"),
        }),
    );

    // Then it is refused for the reason every Bedrock request is. The request
    // carries no operation header to read it back from, so nothing here has to
    // frame an event stream.
    assertIdentical(error.name, "SimSdkUnbridgedWireRequestError");
    assertStringIncludes(error.message, "bedrock");
    assertStringIncludes(error.message, "AWS JSON protocol");

    await simAws.backgroundTasksComplete();
  });
});
