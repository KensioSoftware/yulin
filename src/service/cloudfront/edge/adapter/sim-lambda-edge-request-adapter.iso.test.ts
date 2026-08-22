import { assertFalse, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { SimLambdaEdgeRequestAdapter } from "./sim-lambda-edge-request-adapter.js";

/**
 * The request a handler hands back, built from what it was given.
 */
function handlerRequest(
  edgeRequest: LambdaAtEdge.Request,
  body: LambdaAtEdge.Body,
): LambdaAtEdge.Request {
  return { ...edgeRequest, body };
}

describe("Simulated Lambda@Edge request adaptation", () => {
  it("drops the viewer's content-length when a handler replaces the body", async () => {
    // Given a POST the handler saw the body of.
    const adapter = new SimLambdaEdgeRequestAdapter();
    const viewerRequest = new Request("https://example.test/orders", {
      method: "POST",
      headers: { "content-type": "text/plain", "content-length": "10" },
      body: "order=1042",
    });
    const edgeRequest = await adapter.toEdgeRequest(viewerRequest, true);

    // When the handler replaces it with a body of a different length.
    const replaced = adapter.fromEdgeRequest(
      handlerRequest(edgeRequest, {
        inputTruncated: false,
        action: "replace",
        encoding: "text",
        data: "order=1042&expedited=true",
      }),
      viewerRequest,
    );

    // Then the stale length is gone and the new body is what carries on.
    assertFalse(replaced.headers.has("content-length"));
    assertIdentical(await replaced.text(), "order=1042&expedited=true");
  });

  it("keeps the viewer's content-length when a handler leaves the body alone", async () => {
    const adapter = new SimLambdaEdgeRequestAdapter();
    const viewerRequest = new Request("https://example.test/orders", {
      method: "POST",
      headers: { "content-length": "10" },
      body: "order=1042",
    });

    const readOnly = adapter.fromEdgeRequest(
      await adapter.toEdgeRequest(viewerRequest, true),
      viewerRequest,
    );

    assertIdentical(readOnly.headers.get("content-length"), "10");
    assertIdentical(await readOnly.text(), "order=1042");
  });
});
