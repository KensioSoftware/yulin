/**
 * The parts of a request a listener rule is matched against.
 *
 * A rule is matched against the request rather than against the load balancer
 * it reached, so this is everything the two simulated condition fields need and
 * nothing else.
 */
export interface SimElbV2MatchableRequest {
  /** The host name the request named, with any port taken off. */
  readonly host: string;
  /** The path of the request URL, which is not its query string. */
  readonly path: string;
}

/**
 * A host name with any port taken off.
 *
 * A `host-header` condition value cannot carry a port on real ELB, so the port
 * a client wrote is not part of the comparison. An IPv6 host keeps its
 * brackets, since the port is what follows them.
 */
function hostName(host: string): string {
  return host.replace(/:\d+$/u, "");
}

/**
 * Read the parts of an HTTP request that listener rules match on.
 *
 * The Host header is what real ELB compares a `host-header` condition against,
 * so it wins over the host name in the URL. They are the same thing on real
 * AWS, where DNS is what brought the request here. In this simulation a request
 * reaches a load balancer at its own DNS name, so sending a Host header is how
 * a test says which name the client asked for.
 */
export function simElbV2MatchableRequest(
  request: Request,
): SimElbV2MatchableRequest {
  const url = new URL(request.url);

  return {
    host: hostName(request.headers.get("host") ?? url.host),
    // The pathname excludes the query string, which is what real ELB compares
    // a path pattern against.
    path: url.pathname,
  };
}
