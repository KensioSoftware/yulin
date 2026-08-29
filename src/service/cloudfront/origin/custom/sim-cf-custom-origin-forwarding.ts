import type { SimCfForwardedToOrigin } from "../../origin-request-policy/sim-cf-forwarded-to-origin.js";

/**
 * The `User-Agent` CloudFront sends when the policies do not carry the
 * viewer's own.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html
 */
const cloudFrontUserAgent = "Amazon CloudFront";

/**
 * The headers CloudFront sends whatever the policies name.
 *
 * These describe the body travelling with the request rather than the viewer
 * making it, and an Origin that lost them would read the wrong bytes.
 */
const bodyHeaders = new Set([
  "content-length",
  "content-type",
  "transfer-encoding",
]);

/**
 * The query string the Origin is asked for, holding the names the policies
 * carry and nothing else.
 *
 * The pairs that travel keep the spelling the viewer wrote them in. A query
 * string re-encoded on the way through is no longer the one the viewer asked
 * for. A name the viewer repeated is repeated to the Origin, which dropping a
 * repeat would change.
 */
export function simCfForwardedOriginSearch(
  viewerSearch: string,
  forwarded: SimCfForwardedToOrigin,
): string {
  const forwardedPairs = viewerSearch
    .replace(/^\?/u, "")
    .split("&")
    .filter((pair) => pair.length > 0)
    .filter((pair) => forwarded.forwardsQueryString(queryStringName(pair)));

  return forwardedPairs.length === 0 ? "" : `?${forwardedPairs.join("&")}`;
}

/**
 * The headers the Origin is sent, which are the viewer's narrowed to what the
 * policies carry plus the ones CloudFront sends regardless.
 *
 * `Host` is left to the caller, which is the one part of the Origin request
 * that comes from the Origin rather than from the viewer or the policies.
 */
export function simCfForwardedOriginHeaders(
  viewerHeaders: Headers,
  forwarded: SimCfForwardedToOrigin,
): Headers {
  const headers = new Headers();

  for (const [name, value] of viewerHeaders) {
    if (bodyHeaders.has(name) || forwarded.forwardsHeader(name)) {
      headers.set(name, value);
    }
  }

  applyForwardedCookies(viewerHeaders, headers, forwarded);
  applyUserAgent(headers, forwarded);
  applyAcceptEncoding(viewerHeaders, headers, forwarded);

  return headers;
}

/**
 * The name half of one `name=value` pair, read the way a viewer's own client
 * wrote it rather than as the bytes it was sent as.
 */
function queryStringName(pair: string): string {
  const [name = ""] = new URLSearchParams(pair).keys();

  return name;
}

/**
 * Write the cookies the policies carry into the one `Cookie` header a request
 * sends them all in, leaving the header off where none of them travels.
 *
 * A policy naming `Cookie` in its headers section carries the header whole,
 * whatever its cookies section says.
 */
function applyForwardedCookies(
  viewerHeaders: Headers,
  headers: Headers,
  forwarded: SimCfForwardedToOrigin,
): void {
  if (forwarded.forwardsHeader("cookie")) {
    return;
  }

  const cookies = (viewerHeaders.get("cookie") ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.length > 0)
    .filter((cookie) => forwarded.forwardsCookie(cookieName(cookie)));

  if (cookies.length > 0) {
    headers.set("cookie", cookies.join("; "));
  }
}

/**
 * The name half of one `name=value` cookie.
 */
function cookieName(cookie: string): string {
  const [name = ""] = cookie.split("=", 1);

  return name;
}

/**
 * State CloudFront as the user agent where the policies do not carry the
 * viewer's own, as CloudFront states itself.
 */
function applyUserAgent(
  headers: Headers,
  forwarded: SimCfForwardedToOrigin,
): void {
  if (!forwarded.forwardsHeader("user-agent")) {
    headers.set("user-agent", cloudFrontUserAgent);
  }
}

/**
 * Ask the Origin for the compression the cache policy keyed on.
 *
 * A cache policy that set either `EnableAcceptEncoding` flag decides this
 * header on its own, and the normalized value replaces a viewer's own that an
 * origin request policy carried. A policy that set neither leaves whatever the
 * policies carried, which is the viewer's header or no header at all.
 */
function applyAcceptEncoding(
  viewerHeaders: Headers,
  headers: Headers,
  forwarded: SimCfForwardedToOrigin,
): void {
  if (!forwarded.keysOnCompression) {
    return;
  }

  const acceptEncoding = forwarded.normalizedAcceptEncoding(viewerHeaders);

  headers.delete("accept-encoding");

  if (acceptEncoding !== undefined) {
    headers.set("accept-encoding", acceptEncoding);
  }
}
