import { assertIdentical, assertTrue, assertUuidV4 } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontResponseHeader } from "./sim-cf-response-header.js";
import { SimCloudFrontResponseHeadersPolicy } from "./sim-cf-response-headers-policy.js";

describe("SimCloudFrontResponseHeadersPolicy", () => {
  function policy(
    properties: Partial<{
      customHeaders: SimCloudFrontResponseHeader[];
      headersToRemove: string[];
    }> = {},
  ): SimCloudFrontResponseHeadersPolicy {
    return new SimCloudFrontResponseHeadersPolicy({
      name: "TestPolicy",
      ...properties,
    });
  }

  it("gives each policy an ID of its own", () => {
    // Given two policies created with the same name.
    const first = policy();
    const second = policy();

    // Then each has an ID of the shape CloudFront gives a policy, and they are
    // told apart by it.
    assertUuidV4(first.id);
    assertUuidV4(second.id);
    assertTrue(first.id !== second.id);
  });

  it("adds its headers to a response", () => {
    // Given a policy setting a header the Origin does not.
    const applied = policy({
      customHeaders: [
        new SimCloudFrontResponseHeader({
          name: "Vary",
          value: "Accept-Encoding",
          override: true,
        }),
      ],
    }).apply(
      new Response("body", { headers: { "content-type": "text/plain" } }),
    );

    // Then the policy's header joins the Origin's.
    assertIdentical(applied.headers.get("vary"), "Accept-Encoding");
    assertIdentical(applied.headers.get("content-type"), "text/plain");
  });

  it("removes the headers it is told to", () => {
    // Given a policy removing a header the Origin sent.
    const applied = policy({ headersToRemove: ["Server"] }).apply(
      new Response("body", { headers: { server: "AmazonS3" } }),
    );

    // Then it is gone from the response.
    assertIdentical(applied.headers.get("server"), null);
  });

  it("removes headers before adding them, so one named in both is present", () => {
    // Given a policy that both removes and adds the same header, without
    // Override, which alone would have kept the Origin's value.
    const applied = policy({
      headersToRemove: ["Cache-Control"],
      customHeaders: [
        new SimCloudFrontResponseHeader({
          name: "Cache-Control",
          value: "public, max-age=60",
          override: false,
        }),
      ],
    }).apply(
      new Response("body", { headers: { "cache-control": "no-store" } }),
    );

    // Then the removal happens first, so nothing is there to keep and the
    // policy's value is what the viewer gets.
    assertIdentical(applied.headers.get("cache-control"), "public, max-age=60");
  });

  it("keeps the response status and body", async () => {
    // Given an error response from the Origin.
    const applied = policy({
      customHeaders: [
        new SimCloudFrontResponseHeader({
          name: "Vary",
          value: "Accept-Encoding",
          override: true,
        }),
      ],
    }).apply(
      new Response("not found", { status: 404, statusText: "Not Found" }),
    );

    // Then only the headers change: a policy does not decide what is served.
    assertIdentical(applied.status, 404);
    assertIdentical(applied.statusText, "Not Found");
    assertIdentical(await applied.text(), "not found");
  });

  it("passes a response through when it sets and removes nothing", () => {
    // Given a policy with no headers configured either way.
    const applied = policy().apply(
      new Response("body", { headers: { "content-type": "text/plain" } }),
    );

    // Then the response is unchanged.
    assertIdentical(applied.headers.get("content-type"), "text/plain");
    assertIdentical(applied.status, 200);
  });
});
