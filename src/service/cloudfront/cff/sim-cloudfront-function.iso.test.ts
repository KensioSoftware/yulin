import { describe, it } from "vitest";
import { SimCloudFrontFunction } from "./sim-cloudfront-function.js";
import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

describe("sim CloudFront Function", () => {
  it("applies default handler function for viewer-request", async () => {
    const simCff = new SimCloudFrontFunction({ name: "foo-cff" });

    const cffResponse = await simCff.handleViewerRequest(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
    );

    assertInstanceOf(cffResponse, Request);
    const url = new URL(cffResponse.url);
    assertIdentical(url.pathname, "/foo/bar/object.json");
  });

  it("applies default handler function for viewer-response", async () => {
    const simCff = new SimCloudFrontFunction({ name: "foo-cff" });

    const cffResponse = await simCff.handleViewerResponse(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
      new Response(),
    );

    assertInstanceOf(cffResponse, Response);
  });

  it("applies injected handler function", async () => {
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

    const cffResponse = await simCff.handleViewerRequest(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
    );

    assertInstanceOf(cffResponse, Request);
    const url = new URL(cffResponse.url);
    assertIdentical(url.pathname, "/foo/bar/foobar.html");
  });
});
