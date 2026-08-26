import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
} from "@kensio/smartass";
import { SimCffEventAdapter } from "./sim-cff-event-adapter.js";
import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";

describe("query string spelling through a sim CloudFront Function", () => {
  const adapter = new SimCffEventAdapter();

  const viewerRequest = (search: string): Request =>
    new Request(`https://example.test/liju/search${search}`);

  const querystringSeenBy = (search: string): CloudFrontFunction.QueryString =>
    adapter.toViewerRequestEvent(viewerRequest(search)).request.querystring;

  const forwarded = (search: string): string => {
    // Given a Function returning the request it was handed.
    const request = viewerRequest(search);
    const event = adapter.toViewerRequestEvent(request);

    const result = adapter.fromViewerRequestResult(event.request, request);
    assertInstanceOf(result, Request);

    return new URL(result.url).search;
  };

  it("hands a Function the percent-encoding the viewer sent", () => {
    assertObjectMatches(querystringSeenBy("?q=%E5%AE%B6"), {
      q: { value: "%E5%AE%B6" },
    });
  });

  it("tells a plus from an encoded space", () => {
    assertObjectMatches(querystringSeenBy("?q=a+b"), { q: { value: "a+b" } });
    assertObjectMatches(querystringSeenBy("?q=a%20b"), {
      q: { value: "a%20b" },
    });
  });

  it("leaves a percent-encoded parameter name encoded", () => {
    assertObjectMatches(querystringSeenBy("?%E5%AE%B6=1"), {
      "%E5%AE%B6": { value: "1" },
    });
  });

  it("keeps every value of a repeated parameter as sent", () => {
    assertObjectMatches(querystringSeenBy("?tag=a%20b&tag=c+d"), {
      tag: {
        value: "a%20b",
        multiValue: [{ value: "a%20b" }, { value: "c+d" }],
      },
    });
  });

  it("reads a parameter with no value as an empty one", () => {
    assertObjectMatches(querystringSeenBy("?draft"), { draft: { value: "" } });
  });

  it("forwards an untouched query string to the Origin byte for byte", () => {
    assertIdentical(forwarded("?q=%E5%AE%B6"), "?q=%E5%AE%B6");
    assertIdentical(forwarded("?q=a+b"), "?q=a+b");
    assertIdentical(forwarded("?q=a%20b"), "?q=a%20b");
    assertIdentical(forwarded("?tag=x&tag=y"), "?tag=x&tag=y");
  });

  it("sends the query a Function writes without encoding it again", () => {
    // Given a Function replacing the query with one of its own.
    const request = viewerRequest("?q=%E5%AE%B6");
    const event = adapter.toViewerRequestEvent(request);
    event.request.querystring = {
      term: { value: "%E5%AE%B6" },
      page: { value: "2" },
    };

    const result = adapter.fromViewerRequestResult(event.request, request);
    assertInstanceOf(result, Request);

    assertIdentical(new URL(result.url).search, "?term=%E5%AE%B6&page=2");
  });

  it("builds a redirect from a value the viewer encoded", () => {
    // Given a Function redirecting to the encoded search it was handed.
    const request = viewerRequest("?q=%E5%AE%B6");
    const event = adapter.toViewerRequestEvent(request);
    const term = event.request.querystring["q"];
    assertObjectMatches(term, { value: "%E5%AE%B6" });

    const result = adapter.fromViewerRequestResult(
      {
        statusCode: 308,
        statusDescription: "Permanent Redirect",
        headers: {
          location: { value: `/liju/search/?q=${term.value}` },
        },
      },
      request,
    );
    assertInstanceOf(result, Response);

    assertIdentical(result.status, 308);
    assertIdentical(
      result.headers.get("location"),
      "/liju/search/?q=%E5%AE%B6",
    );
  });
});
