import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import { SimCloudFrontNoSuchResponseHeadersPolicy } from "../../error/sim-cloudfront.error.js";

/**
 * Applies the response headers policy a resolved Behavior names.
 *
 * CloudFront applies the policy after the response leaves the cache and before
 * the viewer-response event, so a custom error page carries the policy's
 * headers and a viewer-response CloudFront Function sees them in its event.
 *
 * https://aws.amazon.com/about-aws/whats-new/2021/11/amazon-cloudfront-response-headers-policies/
 */
export class SimCfResponseHeadersApplicator {
  /**
   * Return the response with the Behavior's policy applied, or the response
   * unchanged when the Behavior names no policy.
   */
  apply(
    cloudFront: SimCloudFront,
    request: Request,
    response: Response,
    behaviour: SimCloudFrontBehavior,
  ): Response {
    const policyId = behaviour.responseHeadersPolicyId;

    if (policyId === undefined) {
      return response;
    }

    const policy = cloudFront.getResponseHeadersPolicyById(policyId);

    if (policy === undefined) {
      throw new SimCloudFrontNoSuchResponseHeadersPolicy(
        `Sim CloudFront response headers policy ${policyId} does not exist. ` +
          `Only a policy created in this simulation can be applied, so a ` +
          `managed policy ID, which names a policy AWS owns rather than one a ` +
          `template creates, will not be found.`,
      );
    }

    return policy.apply(response, request.headers.get("origin"));
  }
}
