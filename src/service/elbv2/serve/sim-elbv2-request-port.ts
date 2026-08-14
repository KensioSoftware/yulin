/**
 * The port a request reached a load balancer on.
 *
 * A URL naming no port means the scheme's own, which is what decides between
 * an HTTP listener on 80 and an HTTPS one on 443 when a client writes neither.
 */
export function simElbV2RequestPort(url: URL): number {
  if (url.port !== "") {
    return Number(url.port);
  }

  if (url.protocol === "https:") {
    return 443;
  }

  return 80;
}
