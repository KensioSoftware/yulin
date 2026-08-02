interface SimPayload2ProxiedRequest {
  readonly request: Request;
  /** The AWS-shaped hostname of the endpoint the request reached. */
  readonly domainName: string;
  readonly traceId: string;
  readonly sourceIp: string;
}

/**
 * Reads the parts of an HTTP request that payload format 2.0 delivers in its
 * own event fields rather than as raw request data.
 *
 * Keeping this separate leaves the event builder to assemble the event from
 * parts, without also owning the header, cookie and query conventions.
 */
export class SimPayload2RequestParts {
  /**
   * Collect request headers, which payload format 2.0 delivers as single
   * lowercased values.
   *
   * Cookies are left out because they travel in their own event field. The
   * proxy headers are set rather than merged: AWS terminates the connection
   * itself and rewrites them before the handler sees them, so whatever a
   * client sent under those names does not survive.
   */
  headers(proxied: SimPayload2ProxiedRequest): Record<string, string> {
    // Fetch API header names are already lowercased, which is the case
    // payload format 2.0 delivers them in, and repeats are already joined.
    const headers = new Map<string, string>();
    proxied.request.headers.forEach((value, name) => {
      headers.set(name, value);
    });
    headers.delete("cookie");

    // The endpoint's own hostname, not the localhost one the request arrived
    // at, because that is the hostname the request named on real AWS.
    headers.set("host", proxied.domainName);
    headers.set("x-amzn-trace-id", proxied.traceId);
    headers.set("x-forwarded-for", proxied.sourceIp);
    // Simulated endpoints are reached over plain localhost HTTP, while a real
    // one is only reachable over HTTPS, so these describe the AWS endpoint.
    headers.set("x-forwarded-port", "443");
    headers.set("x-forwarded-proto", "https");

    return Object.fromEntries(headers);
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

  /**
   * Collect query string parameters, joining repeated keys with commas as
   * payload format 2.0 does.
   */
  queryStringParameters(url: URL): Record<string, string> {
    const keys = new Set(url.searchParams.keys());

    return Object.fromEntries(
      [...keys].map((key): [string, string] => [
        key,
        url.searchParams.getAll(key).join(","),
      ]),
    );
  }
}
