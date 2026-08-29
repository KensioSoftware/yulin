import {
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCloudFrontCacheKey } from "../cache-policy/sim-cf-cache-key.js";
import { SimCfForwardedToOrigin } from "./sim-cf-forwarded-to-origin.js";
import { SimCfOriginRequestForwarding } from "./sim-cf-origin-request-forwarding.js";

describe("What a cache Behavior carries to its Origin", () => {
  it("carries nothing where the Behavior names neither policy", () => {
    // Given a Behavior with no cache policy and no origin request policy.
    const forwarded = new SimCfForwardedToOrigin();

    // Then none of the viewer's request travels.
    assertFalse(forwarded.forwardsHeader("accept"));
    assertFalse(forwarded.forwardsCookie("session"));
    assertFalse(forwarded.forwardsQueryString("page"));
  });

  it("carries what the cache key names with no origin request policy", () => {
    // Given a Behavior whose cache policy keys on a header, a cookie and a
    // query string, and which names no origin request policy.
    const forwarded = new SimCfForwardedToOrigin({
      cacheKey: new SimCloudFrontCacheKey({
        headerBehavior: "whitelist",
        headers: ["Accept-Language"],
        cookieBehavior: "whitelist",
        cookies: ["session"],
        queryStringBehavior: "whitelist",
        queryStrings: ["page"],
      }),
    });

    // Then the three names it keyed on travel, since an Origin has to be able
    // to answer for the key it was asked about.
    assertTrue(forwarded.forwardsHeader("accept-language"));
    assertTrue(forwarded.forwardsCookie("session"));
    assertTrue(forwarded.forwardsQueryString("page"));

    // And nothing else does.
    assertFalse(forwarded.forwardsHeader("accept"));
    assertFalse(forwarded.forwardsCookie("theme"));
    assertFalse(forwarded.forwardsQueryString("sort"));
  });

  it("carries the union of the two policies", () => {
    // Given a Behavior keying its cache on one query string and forwarding
    // another, which is the pair CloudFront sends between them.
    const forwarded = new SimCfForwardedToOrigin({
      cacheKey: new SimCloudFrontCacheKey({
        queryStringBehavior: "whitelist",
        queryStrings: ["page"],
      }),
      forwarding: new SimCfOriginRequestForwarding({
        queryStringBehavior: "whitelist",
        queryStrings: ["sort"],
      }),
    });

    // Then both travel, and a third the viewer sent does not.
    assertTrue(forwarded.forwardsQueryString("page"));
    assertTrue(forwarded.forwardsQueryString("sort"));
    assertFalse(forwarded.forwardsQueryString("utm_source"));
  });

  it("reads a header name in whichever case it was written", () => {
    // Given a policy naming a header the way a person writes one.
    const forwarded = new SimCfForwardedToOrigin({
      forwarding: new SimCfOriginRequestForwarding({
        headerBehavior: "whitelist",
        headers: ["X-Request-Id"],
      }),
    });

    // Then a viewer sending it lower case is still sending the same header.
    assertTrue(forwarded.forwardsHeader("x-request-id"));
  });

  it("reads a cookie and a query string name case sensitively", () => {
    // Given a policy naming a cookie and a query string, which CloudFront
    // reads as written rather than as HTTP reads a header name.
    const forwarded = new SimCfForwardedToOrigin({
      forwarding: new SimCfOriginRequestForwarding({
        cookieBehavior: "whitelist",
        cookies: ["Session"],
        queryStringBehavior: "whitelist",
        queryStrings: ["Page"],
      }),
    });

    // Then a viewer sending either in another case is sending another name.
    assertTrue(forwarded.forwardsCookie("Session"));
    assertFalse(forwarded.forwardsCookie("session"));
    assertTrue(forwarded.forwardsQueryString("Page"));
    assertFalse(forwarded.forwardsQueryString("page"));
  });

  it("carries every viewer header where the policy says allViewer", () => {
    // Given a Behavior on a policy forwarding the whole viewer request, which
    // is what AllViewer does.
    const forwarded = new SimCfForwardedToOrigin({
      forwarding: new SimCfOriginRequestForwarding({
        headerBehavior: "allViewer",
        cookieBehavior: "all",
        queryStringBehavior: "all",
      }),
    });

    // Then anything the viewer sent travels.
    assertTrue(forwarded.forwardsHeader("x-anything"));
    assertTrue(forwarded.forwardsCookie("anything"));
    assertTrue(forwarded.forwardsQueryString("anything"));
  });

  it("carries every viewer header where the policy adds CloudFront's own", () => {
    // Given a Behavior on a policy listing CloudFront headers alongside the
    // viewer's, which is what AllViewerAndCloudFrontHeaders-2022-06 does. The
    // list names headers CloudFront generates rather than the viewer's.
    const forwarded = new SimCfForwardedToOrigin({
      forwarding: new SimCfOriginRequestForwarding({
        headerBehavior: "allViewerAndWhitelistCloudFront",
        headers: ["CloudFront-Viewer-Country"],
      }),
    });

    // Then a header the viewer sent travels whether or not it is listed.
    assertTrue(forwarded.forwardsHeader("x-anything"));
    assertTrue(forwarded.forwardsHeader("cloudfront-viewer-country"));
  });

  it("carries everything but the names an allExcept lists", () => {
    // Given a Behavior on a policy withholding one header and one cookie,
    // which is how AllViewerExceptHostHeader is written.
    const forwarded = new SimCfForwardedToOrigin({
      forwarding: new SimCfOriginRequestForwarding({
        headerBehavior: "allExcept",
        headers: ["Host"],
        cookieBehavior: "allExcept",
        cookies: ["session"],
      }),
    });

    // Then the two named are the only ones left behind.
    assertFalse(forwarded.forwardsHeader("host"));
    assertTrue(forwarded.forwardsHeader("accept"));
    assertFalse(forwarded.forwardsCookie("session"));
    assertTrue(forwarded.forwardsCookie("theme"));
  });

  it("asks the Origin for the compression the cache policy keyed on", () => {
    // Given a Behavior whose cache policy caches gzip and brotli apart, and a
    // viewer that accepts both along with an encoding the policy left out.
    const forwarded = new SimCfForwardedToOrigin({
      cacheKey: new SimCloudFrontCacheKey({
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      }),
    });
    const headers = new Headers({ "accept-encoding": "deflate, gzip, br" });

    // Then the Origin is asked for the two the policy keyed on, in the order
    // CloudFront normalizes them to.
    assertIdentical(forwarded.normalizedAcceptEncoding(headers), "gzip, br");
  });

  it("asks the Origin for no compression where the policy keyed on none", () => {
    // Given a Behavior whose cache policy sets neither compression flag, and a
    // viewer that accepts gzip anyway.
    const forwarded = new SimCfForwardedToOrigin();
    const headers = new Headers({ "accept-encoding": "gzip" });

    // Then there is no normalized header to send, so the Origin is asked for
    // the object uncompressed.
    assertUndefined(forwarded.normalizedAcceptEncoding(headers));
  });
});
