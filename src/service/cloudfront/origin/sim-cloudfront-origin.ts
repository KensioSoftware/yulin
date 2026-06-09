import type { SimCloudFrontOriginRequest } from "./sim-cloudfront-req-res.js";

/**
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html
 */
export interface SimCloudFrontOrigin {
  fetch(request: SimCloudFrontOriginRequest): Promise<Response>;
}
