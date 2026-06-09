import type { SimCloudFrontDistribution } from "../distribution/sim-cloudfront-distribution.js";
import type { SimCloudFrontBehavior } from "../behaviour/sim-cloud-front-behavior.js";

export interface SimCloudFrontOriginRequest {
  distribution: SimCloudFrontDistribution;
  behavior: SimCloudFrontBehavior;
  req: Request;
}
