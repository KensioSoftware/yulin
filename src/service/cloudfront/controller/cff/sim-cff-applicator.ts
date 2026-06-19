import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * Applies CloudFront Functions associated with a resolved Behavior.
 */
export class SimCffApplicator {
  /**
   * Apply viewer request CloudFront Function if configured.
   */
  applyViewerRequest(
    cloudFront: SimCloudFront,
    req: Request,
    behaviour: SimCloudFrontBehavior,
  ): Request | Response {
    const viewerRequestCffArn = behaviour.functionAssociations?.viewerRequest;
    if (viewerRequestCffArn === undefined) {
      return req;
    }

    const viewerRequestCff =
      cloudFront.getCloudFrontFunctionByArn(viewerRequestCffArn);
    assertDefined(
      viewerRequestCff,
      `CloudFront Function ${viewerRequestCffArn} for viewer-request`,
    );

    return viewerRequestCff.handleViewerRequest(req);
  }

  /**
   * Apply viewer response CloudFront Function if configured.
   */
  applyViewerResponse(
    cloudFront: SimCloudFront,
    req: Request,
    res: Response,
    behaviour: SimCloudFrontBehavior,
  ): Response {
    const viewerResponseCffArn = behaviour.functionAssociations?.viewerResponse;
    if (viewerResponseCffArn === undefined) {
      return res;
    }

    const viewerResponseCff =
      cloudFront.getCloudFrontFunctionByArn(viewerResponseCffArn);
    assertDefined(
      viewerResponseCff,
      `CloudFront Function ${viewerResponseCffArn} for viewer-response`,
    );

    return viewerResponseCff.handleViewerResponse(req, res);
  }
}
