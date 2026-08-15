import { simAwsRequestHostname } from "../../../../../serve/http/url/sim-aws-request-hostname.js";

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
 * Read the parts of an HTTP request that listener rules match on.
 *
 * The Host header is what real ELB compares a `host-header` condition against,
 * so it wins over the host name in the URL. They are the same thing on real
 * AWS, where DNS is what brought the request here.
 *
 * The host name is the AWS-facing one, so a request served under the
 * Yulin-local suffix is matched against the name the client asked for rather
 * than against the localhost name it reached the server at. That is what makes
 * host-based routing agree with what Route53 resolved: a request to
 * `api.example.test.sim-aws.localhost` is claimed by a rule on
 * `api.example.test`, the same rule a browser resolving that name would meet.
 * A condition value cannot carry a port on real ELB, and the AWS-facing host
 * name has none either.
 */
export function simElbV2MatchableRequest(
  request: Request,
): SimElbV2MatchableRequest {
  return {
    host: simAwsRequestHostname(request),
    // The pathname excludes the query string, which is what real ELB compares
    // a path pattern against.
    path: new URL(request.url).pathname,
  };
}
