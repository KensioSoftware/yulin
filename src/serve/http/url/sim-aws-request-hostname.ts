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
  const requestHost = request.headers.get("host") ?? new URL(request.url).host;

  return new SimAwsLocalUrl({
    input: `http://${requestHost}/`,
  }).withoutLocalhostSuffix().hostname;
}
