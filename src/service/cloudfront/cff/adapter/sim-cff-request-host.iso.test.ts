import { describe, it } from "vitest";
import { assertIdentical } from "@kensio/smartass";
import { SimCffRequestResponseAdapter } from "./sim-cff-request-response-adapter.js";
import { SimCffEventAdapter } from "./sim-cff-event-adapter.js";

describe("host header seen by a sim CloudFront Function", () => {
  const adapter = new SimCffRequestResponseAdapter();

  it("presents the Distribution domain name for a request served locally", () => {
    // Given a request served on the Yulin local server.
    const request = new Request(
      "http://distro123.cloudfront.net.sim-aws.localhost:52341/index.html",
      {
        headers: { host: "distro123.cloudfront.net.sim-aws.localhost:52341" },
      },
    );

    const cffRequest = adapter.toCffRequest(request);

    assertIdentical(
      cffRequest.headers["host"]?.value,
      "distro123.cloudfront.net",
    );
  });

  it("presents an alternate domain name unchanged", () => {
    const request = new Request(
      "http://cdn.example.test.sim-aws.localhost:52341/index.html",
      { headers: { host: "cdn.example.test.sim-aws.localhost:52341" } },
    );

    const cffRequest = adapter.toCffRequest(request);

    assertIdentical(cffRequest.headers["host"]?.value, "cdn.example.test");
  });

  it("leaves a real CloudFront host alone", () => {
    const request = new Request("https://distro123.cloudfront.net/index.html");

    const cffRequest = adapter.toCffRequest(request);

    assertIdentical(
      cffRequest.headers["host"]?.value,
      "distro123.cloudfront.net",
    );
  });

  it("presents the same host in a viewer-response event", () => {
    const eventAdapter = new SimCffEventAdapter();
    const request = new Request(
      "http://distro123.cloudfront.net.sim-aws.localhost:52341/index.html",
      {
        headers: { host: "distro123.cloudfront.net.sim-aws.localhost:52341" },
      },
    );

    const viewerRequestEvent = eventAdapter.toViewerRequestEvent(request);
    const viewerResponseEvent = eventAdapter.toViewerResponseEvent(
      request,
      new Response("<h1>Hello</h1>"),
    );

    assertIdentical(
      viewerResponseEvent.request.headers["host"]?.value,
      viewerRequestEvent.request.headers["host"]?.value,
    );
  });

  it("restores the host the request arrived with", () => {
    // Given a function that rewrites the read-only host header.
    const request = new Request(
      "http://distro123.cloudfront.net.sim-aws.localhost:52341/index.html",
      {
        headers: { host: "distro123.cloudfront.net.sim-aws.localhost:52341" },
      },
    );
    const cffRequest = adapter.toCffRequest(request);
    cffRequest.headers["host"] = { value: "somewhere.else.test" };

    const originRequest = adapter.fromCffRequest(cffRequest, request);

    assertIdentical(
      originRequest.headers.get("host"),
      "distro123.cloudfront.net.sim-aws.localhost:52341",
    );
  });

  it("adds no host header when the request arrived without one", () => {
    const request = new Request("https://distro123.cloudfront.net/index.html");
    const cffRequest = adapter.toCffRequest(request);

    const originRequest = adapter.fromCffRequest(cffRequest, request);

    assertIdentical(originRequest.headers.get("host"), null);
  });
});
