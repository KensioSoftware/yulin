import { simAwsRequestHostname } from "../../../serve/http/url/sim-aws-request-hostname.js";
import { simWafBodyInspectionLimitBytes } from "../web-acl/sim-waf-association-config.js";
import { SimWafRequestLabels } from "./sim-waf-request-labels.js";

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

  /**
   * The AWS-facing hostname the request was addressed to, which is the Host
   * header with the Yulin-local suffix taken off it.
   */
  readonly host: string;

  /** The request body, or nothing when the request carried none. */
  readonly body: Uint8Array | undefined;

  /**
   * How many bytes of the body a rule inspecting it reads.
   *
   * This travels with the request because it belongs to the resource the
   * request reached rather than to the rule. A rule is compiled once, when the
   * web ACL is written, and the same compiled rule then runs in front of a
   * distribution and a REST API stage with a different limit for each.
   */
  readonly bodyInspectionLimitBytes: number;

  /** The labels the rules that have run so far added to this request. */
  readonly labels: SimWafRequestLabels;
}

/**
 * Read the parts of an HTTP request that a web ACL inspects.
 *
 * The body is passed in rather than read here because a request body is a
 * stream that cannot be consumed twice, and everything that serves a request in
 * this simulator has already buffered it by the time WAF gets a look.
 *
 * The hostname is the one the request would have used against real AWS. A
 * simulated endpoint is served under `*.sim-aws.localhost`, and a rule reading
 * the raw Host header would see that suffix on every request that reached
 * anything at all.
 *
 * The body inspection limit defaults to the 16 KB every resource type this
 * simulation protects reads by default. A web ACL raising it with
 * `AssociationConfig` passes the raised figure in.
 */
export function simWafInspectedRequest(
  request: Request,
  body?: Uint8Array,
  bodyInspectionLimitBytes: number = simWafBodyInspectionLimitBytes,
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
    host: simAwsRequestHostname(request),
    body,
    bodyInspectionLimitBytes,
    labels: new SimWafRequestLabels(),
  };
}
