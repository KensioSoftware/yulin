/**
 * The parts of an HTTP request a web ACL's rules are matched against.
 *
 * A rule reads the request rather than anything about the resource it reached,
 * so this is everything the simulated field-to-match kinds need and nothing
 * else. It is what the CloudFront, API Gateway and Cognito serving paths hand
 * to a web ACL once they are associated with one.
 */
export interface SimWafInspectedRequest {
  /** The request method, upper case, as WAF reports it. */
  readonly method: string;

  /** The path of the request URL, which is not its query string. */
  readonly uriPath: string;

  /** The query string with no leading `?`, undecoded. */
  readonly queryString: string;

  readonly headers: Headers;

  /** The request body, or nothing when the request carried none. */
  readonly body: Uint8Array | undefined;
}

/**
 * Read the parts of an HTTP request that a web ACL inspects.
 *
 * The body is passed in rather than read here because a request body is a
 * stream that cannot be consumed twice, and everything that serves a request in
 * this simulator has already buffered it by the time WAF gets a look.
 */
export function simWafInspectedRequest(
  request: Request,
  body?: Uint8Array,
): SimWafInspectedRequest {
  const url = new URL(request.url);

  return {
    method: request.method,
    // The pathname excludes the query string and keeps its percent encoding,
    // which is the value real WAF compares a `UriPath` rule against. Decoding
    // it is what the URL_DECODE text transformation is for.
    uriPath: url.pathname,
    queryString: url.search.replace(/^\?/u, ""),
    headers: request.headers,
    body,
  };
}
