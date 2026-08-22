import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";

/**
 * Convert Fetch API headers into the Lambda@Edge header shape.
 *
 * Every header is keyed by its lowercase name and holds a list, because
 * CloudFront presents repeated headers as repeated entries rather than as one
 * joined value. `Headers` already lowercases its keys, and it joins repeated
 * values with a comma, so a `set-cookie` is split back out through
 * `getSetCookie` and everything else arrives as the single entry it was.
 */
export function toEdgeHeaders(headers: Headers): LambdaAtEdge.Headers {
  const edgeHeaders = new Map<string, LambdaAtEdge.Header[]>();

  for (const [name, value] of headers.entries()) {
    if (name !== "set-cookie") {
      edgeHeaders.set(name, [{ key: headerKey(name), value }]);
    }
  }

  const setCookies = headers.getSetCookie();

  if (setCookies.length > 0) {
    edgeHeaders.set(
      "set-cookie",
      setCookies.map((value) => ({ key: "Set-Cookie", value })),
    );
  }

  return Object.fromEntries(edgeHeaders);
}

/**
 * Convert Lambda@Edge headers back into Fetch API headers.
 *
 * A handler that left the header list alone hands back what it was given, and
 * one that added an entry hands back a list with the entry on the end. Both
 * are appended in order, so a repeated header survives the round trip.
 */
export function fromEdgeHeaders(
  edgeHeaders: LambdaAtEdge.Headers | undefined,
): Headers {
  const headers = new Headers();
  const named = Object.entries(edgeHeaders ?? {});

  for (const [name, values] of named) {
    for (const header of values) {
      headers.append(header.key ?? name, header.value);
    }
  }

  return headers;
}

/**
 * The casing CloudFront reports a header name in.
 *
 * Real CloudFront reports the casing the viewer or the origin sent, which
 * `Headers` has already lowercased by the time anything here sees it. The
 * conventional title casing is reconstructed so a handler reading `key` for
 * display gets `User-Agent` rather than `user-agent`. Nothing reads `key` to
 * decide anything, and `fromEdgeHeaders` matches on the lowercase name.
 */
function headerKey(name: string): string {
  return name
    .split("-")
    .map((part) =>
      part === "" ? part : part[0]?.toUpperCase() + part.slice(1),
    )
    .join("-");
}
