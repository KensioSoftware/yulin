import {
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdkWireDispatcher } from "../../../sdk/wire/sim-sdk-wire-dispatcher.js";
import type {
  SimSdkWireRequest,
  SimSdkWireResponse,
} from "../../../sdk/wire/sim-sdk-wire.types.js";
import { SimAws } from "../../aws/sim-aws.js";

const region = "eu-west-2";

const titan = "amazon.titan-text-express-v1";

const signedForBedrock =
  `AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE/20260822/${region}/bedrock/` +
  "aws4_request, SignedHeaders=host, Signature=abc123";

/**
 * A Bedrock Runtime request as the SDK puts one on the wire.
 */
function bedrockRequest(
  request: Partial<SimSdkWireRequest> & Pick<SimSdkWireRequest, "path">,
): SimSdkWireRequest {
  return {
    method: "POST",
    hostname: `bedrock-runtime.${region}.amazonaws.com`,
    body: new Uint8Array(),
    ...request,
    headers: { authorization: signedForBedrock, ...request.headers },
  };
}

function bodyText(response: SimSdkWireResponse): string {
  return Buffer.from(response.body).toString();
}

describe("Bedrock over the wire path", () => {
  it("reads an unsigned invocation sent to a Bedrock Runtime endpoint", async () => {
    // Given a declared body for a model.
    const simAws = new SimAws({ defaultRegionName: region });
    simAws
      .bedrock()
      .responses()
      .onModel(titan, { body: { outputText: "Hi" } });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When an InvokeModel request arrives unsigned, with a query string.
    const response = await dispatcher.dispatch({
      method: "POST",
      hostname: `bedrock-runtime.${region}.amazonaws.com`,
      path: `/model/${titan}/invoke?trace=off`,
      headers: { "content-type": "application/json" },
      body: Buffer.from('{"inputText":"Hello"}'),
    });

    // Then the endpoint said it was Bedrock, and the model's body came back.
    assertIdentical(response.statusCode, 200);
    assertIdentical(response.headers["content-type"], "application/json");
    assertIdentical(bodyText(response), '{"outputText":"Hi"}');

    await simAws.backgroundTasksComplete();
  });

  it("invokes a model with no request body", async () => {
    // Given a declared body for a model.
    const simAws = new SimAws({ defaultRegionName: region });
    simAws
      .bedrock()
      .responses()
      .onModel(titan, { body: { outputText: "Hi" } });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When an InvokeModel request carries no body at all.
    const response = await dispatcher.dispatch(
      bedrockRequest({ path: `/model/${titan}/invoke` }),
    );

    // Then the model still answers.
    assertIdentical(bodyText(response), '{"outputText":"Hi"}');

    await simAws.backgroundTasksComplete();
  });

  it("refuses an invocation naming a guardrail in its headers", async () => {
    // Given a simulation reached over the wire.
    const simAws = new SimAws({ defaultRegionName: region });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When an InvokeModel request names a guardrail.
    const response = await dispatcher.dispatch(
      bedrockRequest({
        path: `/model/${titan}/invoke`,
        headers: { "x-amzn-bedrock-guardrailidentifier": "gr-1" },
        body: Buffer.from('{"inputText":"Hello"}'),
      }),
    );

    // Then it is refused as it is through an intercepted client, rather than
    // answered as if the guardrail had passed.
    assertIdentical(response.statusCode, 400);
    assertStringIncludes(
      response.headers["x-amzn-errortype"] ?? "",
      "Exception",
    );
    assertStringIncludes(bodyText(response), "guardrailIdentifier");

    await simAws.backgroundTasksComplete();
  });

  it("answers a malformed Converse body with an error", async () => {
    // Given a simulation reached over the wire.
    const simAws = new SimAws({ defaultRegionName: region });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When a Converse request carries a body that is not JSON.
    const response = await dispatcher.dispatch(
      bedrockRequest({
        path: `/model/${titan}/converse`,
        body: Buffer.from("{"),
      }),
    );

    // Then the failure is an answer the SDK can read.
    assertIdentical(response.statusCode, 400);
    assertObjectMatches(JSON.parse(bodyText(response)) as object, {
      __type: "SyntaxError",
    });

    await simAws.backgroundTasksComplete();
  });

  it("answers a model id with a malformed escape with an error", async () => {
    // Given a simulation reached over the wire.
    const simAws = new SimAws({ defaultRegionName: region });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When an invocation's model id carries an escape that does not decode.
    const response = await dispatcher.dispatch(
      bedrockRequest({ path: "/model/titan%E0%A4%A/invoke" }),
    );

    // Then the failure is an answer the SDK can read.
    assertIdentical(response.statusCode, 400);
    assertObjectMatches(JSON.parse(bodyText(response)) as object, {
      __type: "URIError",
    });

    await simAws.backgroundTasksComplete();
  });

  for (const [description, request] of [
    ["a path that is no model invocation", { path: "/foundation-models" }],
    ["an action Bedrock Runtime lacks", { path: `/model/${titan}/translate` }],
    [
      "a method other than POST",
      { method: "GET", path: `/model/${titan}/invoke` },
    ],
    [
      "a request signed for another service",
      {
        path: `/model/${titan}/invoke`,
        headers: {
          authorization: signedForBedrock.replace("/bedrock/", "/sagemaker/"),
        },
      },
    ],
  ] as const) {
    it(`refuses ${description}`, async () => {
      // Given a simulation reached over the wire.
      const simAws = new SimAws({ defaultRegionName: region });
      const dispatcher = new SimSdkWireDispatcher(simAws);

      // When the request arrives.
      const error = await assertThrowsErrorAsync(
        async () => await dispatcher.dispatch(bedrockRequest(request)),
      );

      // Then it is refused as a request nothing here can route.
      assertIdentical(error.name, "SimSdkUnbridgedWireRequestError");

      await simAws.backgroundTasksComplete();
    });
  }
});
