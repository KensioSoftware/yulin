/**
 * What AWS knows about a request it proxied, beyond the request itself.
 */
export interface SimProxiedConnection {
  /** The AWS-shaped hostname of the endpoint the request reached. */
  readonly domainName: string;
  readonly traceId: string;
  readonly sourceIp: string;
}

export interface SimProxiedRequest extends SimProxiedConnection {
  readonly request: Request;
}

/**
 * The headers AWS sets itself on a request it proxies to a function.
 *
 * Both payload formats carry the same ones, so both read them from here.
 *
 * These are set rather than merged: AWS terminates the connection itself and
 * rewrites them before the handler sees them, so whatever a client sent under
 * those names does not survive.
 */
export function simProxyHeaders(
  proxied: SimProxiedConnection,
): Record<string, string> {
  return {
    // The endpoint's own hostname, not the localhost one the request arrived
    // at, because that is the hostname the request named on real AWS.
    host: proxied.domainName,
    "x-amzn-trace-id": proxied.traceId,
    "x-forwarded-for": proxied.sourceIp,
    // Simulated endpoints are reached over plain localhost HTTP, while a real
    // one is only reachable over HTTPS, so these describe the AWS endpoint.
    "x-forwarded-port": "443",
    "x-forwarded-proto": "https",
  };
}
