import {
  simProxyHeaders,
  type SimProxiedRequest,
} from "../proxy/sim-proxy-headers.js";

/**
 * Collect query string parameters, joining repeated keys with commas as
 * payload format 2.0 does.
 */
export function simPayload2QueryStringParameters(
  searchParameters: URLSearchParams,
): Record<string, string> {
  const keys = new Set(searchParameters.keys());

  return Object.fromEntries(
    [...keys].map((key): [string, string] => [
      key,
      searchParameters.getAll(key).join(","),
    ]),
  );
}

/**
 * Reads the parts of an HTTP request that payload format 2.0 delivers in its
 * own event fields rather than as raw request data.
 *
 * Keeping this separate leaves the event builder to assemble the event from
 * parts, without also owning the header and cookie conventions.
 */
export class SimPayload2RequestParts {
  /**
   * Collect request headers, which payload format 2.0 delivers as single
   * lowercased values.
   *
   * Cookies are left out because they travel in their own event field, and the
   * headers AWS rewrites itself land on top of whatever the client sent.
   */
  headers(proxied: SimProxiedRequest): Record<string, string> {
    // Fetch API header names are already lowercased, which is the case
    // payload format 2.0 delivers them in, and repeats are already joined.
    const headers = new Map<string, string>();
    proxied.request.headers.forEach((value, name) => {
      headers.set(name, value);
    });
    headers.delete("cookie");

    return {
      ...Object.fromEntries(headers),
      ...simProxyHeaders(proxied),
    };
  }

  /**
   * Collect the request cookies as the separate list the event carries.
   */
  cookies(request: Request): string[] {
    const cookieHeader = request.headers.get("cookie");

    if (cookieHeader === null || cookieHeader.length === 0) {
      return [];
    }

    return cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.length > 0);
  }
}
