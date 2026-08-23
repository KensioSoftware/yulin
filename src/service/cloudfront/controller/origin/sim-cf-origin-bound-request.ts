import type { SimCloudFrontOrigin } from "../../origin/sim-cloudfront-origin.js";

/**
 * A request and the Origin it is about to be fetched from.
 *
 * The two travel together between the origin-request event and the fetch,
 * because a handler can rewrite either of them: the request's URI and headers,
 * and the Origin's domain name, path and custom headers.
 */
export interface SimCfOriginBoundRequest {
  readonly request: Request;
  readonly origin: SimCloudFrontOrigin;
}
