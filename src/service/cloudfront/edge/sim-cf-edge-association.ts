import type { SimArn } from "../../aws/arn.js";

/**
 * One Lambda@Edge function a cache Behavior runs, and how it is invoked.
 *
 * The ARN is a qualified one naming a published version, which is the only
 * thing CloudFront accepts. `includeBody` decides whether the event carries
 * the request body, and it is false unless the association asked for it.
 */
export interface SimCfEdgeAssociation {
  readonly functionArn: SimArn;
  readonly includeBody: boolean;
}

/**
 * The Lambda@Edge functions one cache Behavior runs, by event type.
 *
 * All four of CloudFront's events are here, in the order a request meets them:
 * the two viewer events at the edge, and the two origin events either side of
 * the Origin fetch.
 */
export interface SimCfEdgeAssociations {
  readonly viewerRequest?: SimCfEdgeAssociation;
  readonly originRequest?: SimCfEdgeAssociation;
  readonly originResponse?: SimCfEdgeAssociation;
  readonly viewerResponse?: SimCfEdgeAssociation;
}
