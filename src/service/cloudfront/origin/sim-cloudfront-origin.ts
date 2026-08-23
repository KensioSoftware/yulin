import type { LambdaAtEdge } from "../typings/lambda-at-edge.namespace.js";
import type { SimCloudFrontOriginRequest } from "./sim-cloudfront-request-response.js";

/**
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html
 */
export interface SimCloudFrontOrigin {
  fetch(request: SimCloudFrontOriginRequest): Promise<Response>;

  /**
   * This Origin as an origin event presents it, under `request.origin`.
   */
  toEdgeOrigin(): LambdaAtEdge.Origin;

  /**
   * This Origin as an origin-request handler left it, ready to fetch from.
   *
   * Throws `SimCfEdgeOriginNotSimulated` where the handler asked for an Origin
   * this simulation cannot build, which the applicator turns into the 502 a
   * failed edge function gets.
   */
  withEdgeOrigin(edgeOrigin: LambdaAtEdge.Origin): SimCloudFrontOrigin;
}
