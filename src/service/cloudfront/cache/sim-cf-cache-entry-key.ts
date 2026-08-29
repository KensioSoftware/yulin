import { jsonStringify } from "../../../util/type-guard/json.js";
import { simCfNormalizedAcceptEncoding } from "./sim-cf-accept-encoding.js";
import type {
  SimCfCacheKeyCookieBehavior,
  SimCloudFrontCacheKey,
} from "../cache-policy/sim-cf-cache-key.js";

interface SimCfCacheEntryKeyProperties {
  readonly request: Request;

  /**
   * What the Behavior's cache policy keys on.
   */
  readonly cacheKey: SimCloudFrontCacheKey;

  /**
   * The edge the request arrived at, which caches apart from every other edge.
   */
  readonly edgeId: string;
}

/**
 * The key one request is cached under.
 *
 * CloudFront keys on the request path plus whatever the cache policy names:
 * the query strings, the headers and the cookies it lists, and the normalized
 * `Accept-Encoding` where it enables gzip or brotli. Two requests differing
 * only in something the policy leaves out share one entry, which is the whole
 * point of a cache key.
 *
 * The path sits third in the key, which `simCfCacheEntryKeyPath` reads it back
 * out of when an invalidation matches an entry.
 *
 * The method is part of the key here because a HEAD response carries no body
 * and a GET response does, so serving one from the other would answer with the
 * wrong thing.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html
 */
export function simCfCacheEntryKey(
  properties: SimCfCacheEntryKeyProperties,
): string {
  const { request, cacheKey, edgeId } = properties;
  const url = new URL(request.url);

  return jsonStringify([
    edgeId,
    request.method.toUpperCase(),
    url.pathname,
    keyedQueryStrings(url.searchParams, cacheKey),
    keyedHeaders(request.headers, cacheKey),
    keyedCookies(request.headers, cacheKey),
    simCfNormalizedAcceptEncoding(request.headers, cacheKey),
  ]);
}

/**
 * The query strings the policy keys on, in an order two requests sending them
 * differently still agree on.
 */
function keyedQueryStrings(
  searchParameters: URLSearchParams,
  cacheKey: SimCloudFrontCacheKey,
): string[] {
  return [...searchParameters]
    .filter(([name]) =>
      isKeyedOn(cacheKey.queryStringBehavior, cacheKey.queryStrings, name),
    )
    .map(([name, value]) => `${name}=${value}`)
    .toSorted(byCodePoint);
}

/**
 * The headers the policy keys on, by lower-case name since a header name is
 * case insensitive.
 *
 * A header the policy names and the viewer did not send keys as an empty
 * value, so a request sending it and one leaving it out are kept apart.
 */
function keyedHeaders(
  headers: Headers,
  cacheKey: SimCloudFrontCacheKey,
): string[] {
  if (cacheKey.headerBehavior === "none") {
    return [];
  }

  return cacheKey.headers
    .map((name) => `${name.toLowerCase()}=${headers.get(name) ?? ""}`)
    .toSorted(byCodePoint);
}

/**
 * The cookies the policy keys on, read out of the one `Cookie` header a
 * request sends them all in.
 */
function keyedCookies(
  headers: Headers,
  cacheKey: SimCloudFrontCacheKey,
): string[] {
  return (headers.get("cookie") ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.length > 0)
    .filter((cookie) =>
      isKeyedOn(cacheKey.cookieBehavior, cacheKey.cookies, cookieName(cookie)),
    )
    .toSorted(byCodePoint);
}

/**
 * Order two parts of a key the same way whatever the host's locale is, which a
 * key two requests have to agree on cannot be left to `localeCompare`.
 */
function byCodePoint(one: string, other: string): number {
  if (one === other) {
    return 0;
  }

  return one < other ? -1 : 1;
}

/**
 * The name half of one `name=value` cookie.
 */
function cookieName(cookie: string): string {
  const [name = ""] = cookie.split("=", 1);

  return name;
}

/**
 * Whether one name is in the cache key, under the behaviour its section names.
 *
 * A `whitelist` keys on the names listed and an `allExcept` keys on everything
 * but them, which is the same list read two ways.
 *
 * The cookie behaviours and the query string behaviours are the same four
 * values, so one function reads both.
 */
function isKeyedOn(
  behavior: SimCfCacheKeyCookieBehavior,
  names: readonly string[],
  name: string,
): boolean {
  switch (behavior) {
    case "all": {
      return true;
    }
    case "whitelist": {
      return names.includes(name);
    }
    case "allExcept": {
      return !names.includes(name);
    }
    case "none": {
      return false;
    }
  }
}
