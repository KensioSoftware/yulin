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
  async applyViewerRequest(
    cloudFront: SimCloudFront,
    request: Request,
    behaviour: SimCloudFrontBehavior,
  ): Promise<Request | Response> {
    const viewerRequestCffArn = behaviour.functionAssociations?.viewerRequest;
    if (viewerRequestCffArn === undefined) {
      return request;
    }

    const viewerRequestCff =
      cloudFront.getCloudFrontFunctionByArn(viewerRequestCffArn);
    assertDefined(
      viewerRequestCff,
      `CloudFront Function ${viewerRequestCffArn} for viewer-request`,
    );

    return await viewerRequestCff.handleViewerRequest(request);
  }

  /**
   * Apply viewer response CloudFront Function if configured.
   */
  async applyViewerResponse(
    cloudFront: SimCloudFront,
    request: Request,
    response: Response,
    behaviour: SimCloudFrontBehavior,
  ): Promise<Response> {
    const viewerResponseCffArn = behaviour.functionAssociations?.viewerResponse;
    if (viewerResponseCffArn === undefined) {
      return response;
    }

    const viewerResponseCff =
      cloudFront.getCloudFrontFunctionByArn(viewerResponseCffArn);
    assertDefined(
      viewerResponseCff,
      `CloudFront Function ${viewerResponseCffArn} for viewer-response`,
    );

    return await viewerResponseCff.handleViewerResponse(request, response);
  }
}
