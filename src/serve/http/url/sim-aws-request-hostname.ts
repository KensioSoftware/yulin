import { SimAwsLocalUrl } from "./sim-aws-local-url.js";

/**
 * Get the AWS-facing hostname an incoming request was made to.
 *
 * A request served on localhost carries the Yulin-local host, such as
 * `distro123.cloudfront.net.sim-aws.localhost:52341`, so the local suffix and
 * the local server port are dropped to leave the hostname the same request
 * would have used against real AWS.
 *
 * The Host header is preferred over the URL hostname, since that is what a
 * client sends and what AWS itself routes on.
 */
export function simAwsRequestHostname(request: Request): string {
  return new SimAwsLocalUrl({
    input: `http://${simAwsRequestHost(request)}/`,
  }).withoutLocalhostSuffix().hostname;
}

/**
 * Whether a request reached the local server under the Yulin-local suffix.
 *
 * A request that did carries the local server's port rather than the port the
 * client asked for, because the suffix is how a client reaches localhost while
 * nothing resolves the name it is really after. Anything reading a port out of
 * a request has to know that, which is why the suffix is reported here rather
 * than being taken apart again wherever it matters.
 */
export function isSimAwsLocalRequest(request: Request): boolean {
  const { hostname } = new URL(`http://${simAwsRequestHost(request)}/`);

  return hostname.endsWith(SimAwsLocalUrl.localhostSuffix);
}

/**
 * The host a request named, which is its Host header when it sent one.
 */
function simAwsRequestHost(request: Request): string {
  return request.headers.get("host") ?? new URL(request.url).host;
}
