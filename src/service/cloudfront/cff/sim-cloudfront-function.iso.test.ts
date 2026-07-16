import { describe, it } from "vitest";
import { SimCloudFrontFunction } from "./sim-cloudfront-function.js";
import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

describe("sim CloudFront Function", () => {
  it("applies default handler function for viewer-request", () => {
    const simCff = new SimCloudFrontFunction({ name: "foo-cff" });

    const cffRes = simCff.handleViewerRequest(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
    );

    assertInstanceOf(cffRes, Request);
    const url = new URL(cffRes.url);
    assertIdentical(url.pathname, "/foo/bar/object.json");
  });

  it("applies default handler function for viewer-response", () => {
    const simCff = new SimCloudFrontFunction({ name: "foo-cff" });

    const cffRes = simCff.handleViewerResponse(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
      new Response(),
    );

    assertInstanceOf(cffRes, Response);
  });

  it("applies injected handler function", () => {
    const simCff = new SimCloudFrontFunction({
      name: "foo-cff",
      handlerFunction: (event: CloudFrontFunction.ViewerRequestEvent) => {
        event.request.uri = event.request.uri.replace(
          "object.json",
          "foobar.html",
        );
        return event.request;
      },
    });

    const cffRes = simCff.handleViewerRequest(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
    );

    assertInstanceOf(cffRes, Request);
    const url = new URL(cffRes.url);
    assertIdentical(url.pathname, "/foo/bar/foobar.html");
  });
});
