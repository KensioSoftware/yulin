import {
  simWafBlockedHttpResponse,
  simWafDefaultBlockedResponse,
} from "../../../wafv2/evaluate/sim-waf-blocked-response.js";
import type { SimWafDecision } from "../../../wafv2/evaluate/sim-waf-decision.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontInvalidWebAclId } from "../../error/sim-cloudfront.error.js";
import type { SimCfWebAclResolver } from "../../web-acl/sim-cf-web-acl.js";

/**
 * Puts a request through the web ACL a Distribution names, before anything
 * else has a look at it.
 *
 * CloudFront asks WAF ahead of every content-handling stage, so a blocked
 * request never reaches a viewer-request CloudFront Function, a cache
 * Behavior, a response headers policy or the Origin. It is answered at the
 * edge with the 403 the web ACL's block action describes.
 */
export class SimCfWebAclGuard {
  constructor(private readonly resolveWebAcl: SimCfWebAclResolver) {}

  /**
   * Answer with the request to carry on with, or the response a blocked
   * request gets.
   *
   * The request comes back rather than a bare verdict because an allowing rule
   * can insert headers into what is forwarded, which is what WAF's custom
   * request handling is for.
   */
  async apply(
    request: Request,
    distribution: SimCloudFrontDistribution,
  ): Promise<Request | Response> {
    const webAclArn = distribution.webAclArn;

    if (webAclArn === undefined) {
      return request;
    }

    const found = this.resolveWebAcl(webAclArn);

    if (found === undefined) {
      throw new SimCloudFrontInvalidWebAclId(
        `Sim CloudFront Distribution ${distribution.distributionId} names ` +
          `web ACL ${webAclArn}, which does not exist. A web ACL a ` +
          `Distribution is still in front of cannot be deleted in AWS, so a ` +
          `simulation that deleted one has left the Distribution naming ` +
          `nothing.`,
      );
    }

    const decision = found.wafV2.evaluateRequest({
      webAclArn,
      request,
      body: await requestBody(request),
    });

    return decision.action === "BLOCK"
      ? simWafBlockedHttpResponse(
          decision.blocked ?? simWafDefaultBlockedResponse(),
        )
      : allowedRequest(request, decision);
  }
}

/**
 * The request as it carries on past the web ACL.
 *
 * A rule that matched with custom request handling adds headers to what is
 * forwarded, so the Origin and any CloudFront Function see them. A decision
 * that inserted none leaves the request exactly as the viewer sent it.
 */
function allowedRequest(request: Request, decision: SimWafDecision): Request {
  if (decision.insertedHeaders.length === 0) {
    return request;
  }

  const headers = new Headers(request.headers);

  for (const header of decision.insertedHeaders) {
    headers.set(header.name, header.value);
  }

  const isBodyAllowed = !/^(?:get|head)$/iu.test(request.method);

  return new Request(request.url, {
    method: request.method,
    headers,
    body: isBodyAllowed ? request.clone().body : null,
    duplex: "half",
    redirect: request.redirect,
    signal: request.signal,
  });
}

/**
 * The request body the web ACL's rules are matched against.
 *
 * WAF reads the body of the request as it arrived, and a body is a stream that
 * can only be read once, so it is read from a clone and the request carries on
 * with its own copy intact.
 */
async function requestBody(request: Request): Promise<Uint8Array | undefined> {
  if (request.body === null) {
    return undefined;
  }

  return new Uint8Array(await request.clone().arrayBuffer());
}
