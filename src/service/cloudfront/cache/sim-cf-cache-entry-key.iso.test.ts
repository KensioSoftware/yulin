import { assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCloudFrontCacheKey } from "../cache-policy/sim-cf-cache-key.js";
import { simCfCacheEntryKey } from "./sim-cf-cache-entry-key.js";

const edgeId = "default";
const site = "https://d111111abcdef8.cloudfront.net";

/**
 * The key one request is stored under, for a policy keying on nothing unless
 * the test says otherwise.
 */
function keyFor(
  path: string,
  cacheKey: SimCloudFrontCacheKey = new SimCloudFrontCacheKey(),
  requestInit: RequestInit = {},
  edge = edgeId,
): string {
  return simCfCacheEntryKey({
    request: new Request(`${site}${path}`, requestInit),
    cacheKey,
    edgeId: edge,
  });
}

describe("A sim CloudFront cache key", () => {
  it("keys two paths apart", () => {
    // Given a policy keying on nothing but the path.
    // When two requests for different paths are keyed.
    // Then they are held apart.
    assertTrue(keyFor("/one.html") !== keyFor("/two.html"));
  });

  it("leaves out a query string the policy does not name", () => {
    // Given a policy naming one query string.
    const cacheKey = new SimCloudFrontCacheKey({
      queryStringBehavior: "whitelist",
      queryStrings: ["page"],
    });

    // When two requests differ only in a query string it does not name.
    // Then they share one key.
    assertIdentical(
      keyFor("/list?page=2&utm=email", cacheKey),
      keyFor("/list?page=2&utm=social", cacheKey),
    );
  });

  it("keys on a query string the policy names", () => {
    // Given the same policy.
    const cacheKey = new SimCloudFrontCacheKey({
      queryStringBehavior: "whitelist",
      queryStrings: ["page"],
    });

    // When two requests differ in the query string it names.
    // Then they are held apart.
    assertTrue(
      keyFor("/list?page=1", cacheKey) !== keyFor("/list?page=2", cacheKey),
    );
  });

  it("keys on the query strings a policy naming all of them sends", () => {
    // Given a policy keying on every query string.
    const cacheKey = new SimCloudFrontCacheKey({ queryStringBehavior: "all" });

    // When two requests differ in one the other policy would have ignored.
    // Then they are held apart.
    assertTrue(
      keyFor("/list?utm=email", cacheKey) !==
        keyFor("/list?utm=social", cacheKey),
    );
  });

  it("leaves out the query string an allExcept policy names", () => {
    // Given a policy keying on every query string but one.
    const cacheKey = new SimCloudFrontCacheKey({
      queryStringBehavior: "allExcept",
      queryStrings: ["utm"],
    });

    // When two requests differ in the one it excludes.
    // Then they share one key, and two differing in another do not.
    assertIdentical(
      keyFor("/list?utm=email", cacheKey),
      keyFor("/list?utm=social", cacheKey),
    );
    assertTrue(
      keyFor("/list?page=1", cacheKey) !== keyFor("/list?page=2", cacheKey),
    );
  });

  it("keys the same query strings sent in either order together", () => {
    // Given a policy keying on every query string.
    const cacheKey = new SimCloudFrontCacheKey({ queryStringBehavior: "all" });

    // When one viewer sends them the other way round.
    // Then both key the same, as CloudFront sorts them before keying.
    assertIdentical(
      keyFor("/list?page=1&sort=asc", cacheKey),
      keyFor("/list?sort=asc&page=1", cacheKey),
    );
  });

  it("keys on a header the policy names", () => {
    // Given a policy naming one header.
    const cacheKey = new SimCloudFrontCacheKey({
      headerBehavior: "whitelist",
      headers: ["Accept-Language"],
    });

    // When two requests send different values for it, and a third sends a
    // header the policy does not name.
    const english = keyFor("/", cacheKey, {
      headers: { "accept-language": "en" },
    });
    const french = keyFor("/", cacheKey, {
      headers: { "accept-language": "fr" },
    });
    const traced = keyFor("/", cacheKey, {
      headers: { "accept-language": "en", "x-request-id": "abc" },
    });

    // Then the named header holds two apart and the other does not.
    assertTrue(english !== french);
    assertIdentical(english, traced);
  });

  it("keys on a cookie the policy names", () => {
    // Given a policy naming one cookie.
    const cacheKey = new SimCloudFrontCacheKey({
      cookieBehavior: "whitelist",
      cookies: ["theme"],
    });

    // When two requests send different values for it, alongside one it does
    // not name.
    const dark = keyFor("/", cacheKey, {
      headers: { cookie: "theme=dark; session=1" },
    });
    const light = keyFor("/", cacheKey, {
      headers: { cookie: "theme=light; session=1" },
    });
    const otherSession = keyFor("/", cacheKey, {
      headers: { cookie: "theme=dark; session=2" },
    });

    // Then the named cookie holds two apart and the other does not.
    assertTrue(dark !== light);
    assertIdentical(dark, otherSession);
  });

  it("keys a compressed response apart where the policy enables gzip", () => {
    // Given a policy enabling gzip in the cache key.
    const cacheKey = new SimCloudFrontCacheKey({
      enableAcceptEncodingGzip: true,
    });

    // When one viewer accepts gzip and another accepts nothing.
    // Then the two are held apart, so one object is cached compressed and
    // once not.
    assertTrue(
      keyFor("/", cacheKey, { headers: { "accept-encoding": "gzip" } }) !==
        keyFor("/", cacheKey),
    );
  });

  it("ignores an encoding the policy does not enable", () => {
    // Given a policy enabling gzip alone.
    const cacheKey = new SimCloudFrontCacheKey({
      enableAcceptEncodingGzip: true,
    });

    // When two viewers accept gzip and differ in brotli alone.
    // Then they share one key, since CloudFront would not have asked the
    // Origin for brotli.
    assertIdentical(
      keyFor("/", cacheKey, { headers: { "accept-encoding": "gzip, br" } }),
      keyFor("/", cacheKey, { headers: { "accept-encoding": "gzip" } }),
    );
  });

  it("keys a GET and a HEAD apart", () => {
    // Given a policy keying on nothing but the path.
    // When the same path is asked for both ways.
    // Then the two are held apart, since a HEAD response carries no body.
    assertTrue(
      keyFor("/one.html", new SimCloudFrontCacheKey(), { method: "HEAD" }) !==
        keyFor("/one.html"),
    );
  });

  it("keys two edges apart", () => {
    // Given the same request arriving at two points of presence.
    // When each one is keyed.
    // Then neither is answered from the other's cache.
    assertTrue(
      keyFor("/one.html", new SimCloudFrontCacheKey(), {}, "edge-one") !==
        keyFor("/one.html", new SimCloudFrontCacheKey(), {}, "edge-two"),
    );
  });
});
