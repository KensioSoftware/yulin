import { isSimAwsLocalRequest } from "../../../serve/http/url/sim-aws-request-hostname.js";

/**
 * The port a request reached a load balancer on.
 *
 * A URL naming no port means the scheme's own, which is what decides between
 * an HTTP listener on 80 and an HTTPS one on 443 when a client writes neither.
 *
 * A request served under the Yulin-local suffix names the local server's port
 * instead, which is a port no listener holds and which the client did not
 * choose. That port belongs to the local transport rather than to the load
 * balancer, so the scheme's own port is used for it too, and a request to
 * `http://api.example.test.sim-aws.localhost:<port>/` reaches the listener on
 * 80 as a request to `http://api.example.test/` would.
 */
export function simElbV2RequestPort(request: Request): number {
  const url = new URL(request.url);

  if (isSimAwsLocalRequest(request)) {
    return schemePort(url);
  }

  if (url.port !== "") {
    return Number(url.port);
  }

  return schemePort(url);
}

/**
 * The port a URL's scheme is served on when it names none of its own.
 */
function schemePort(url: URL): number {
  if (url.protocol === "https:") {
    return 443;
  }

  return 80;
}
