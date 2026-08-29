import { simCfCacheableKey } from "../../cache/sim-cf-cacheable-request.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCfCustomErrorResponder } from "../error/sim-cf-custom-error-responder.js";
import type {
  SimCfOriginStage,
  SimCfOriginStageResult,
} from "../origin/sim-cf-origin-stage.js";

/**
 * One request, and everything the content stage needs to answer it.
 */
export interface SimCfContentRequest {
  readonly request: Request;
  readonly cloudFront: SimCloudFront;
  readonly distribution: SimCloudFrontDistribution;
  readonly behaviour: SimCloudFrontBehavior;

  /**
   * The edge the request arrived at, whose cache answers it.
   */
  readonly edgeId: string;
}

/**
 * Answers a request from the Distribution's cache, or from the Origin.
 *
 * This is CloudFront's cache lookup and everything behind it. A key the cache
 * already holds is answered with the Origin left unread. A miss goes to the
 * Origin, has an error replaced with the Distribution's custom error page, and
 * is stored under the key it missed on.
 *
 * An Origin error stays out of the cache. Real CloudFront holds one for
 * `ErrorCachingMinTTL`, which wants a TTL this simulation has yet to keep.
 * Caching an error with no expiry would leave a Distribution answering with it
 * for the length of the test.
 */
export class SimCfContentStage {
  constructor(
    private readonly originStage: SimCfOriginStage,
    private readonly customErrorResponder: SimCfCustomErrorResponder,
  ) {}

  /**
   * Answer one request, reading the Origin only where the cache cannot.
   */
  async serve(content: SimCfContentRequest): Promise<SimCfOriginStageResult> {
    const { request, distribution, behaviour } = content;
    const key = simCfCacheableKey(content);
    const cached = key === undefined ? undefined : distribution.cache.read(key);

    // A hit is answered as the Origin answered it when it was stored, so the
    // status the pipeline reads is the cached one and a viewer-response
    // function runs on a hit as it ran on the miss that filled the cache.
    if (cached !== undefined) {
      return { response: cached, originStatus: cached.status };
    }

    const originResult = await this.originStage.fetch(
      request,
      distribution,
      behaviour,
    );
    const response = await this.customErrorResponder.apply(
      request,
      distribution,
      originResult.response,
    );

    if (key === undefined || originResult.originStatus >= 400) {
      return { response, originStatus: originResult.originStatus };
    }

    return {
      response: await distribution.cache.store(key, response),
      originStatus: originResult.originStatus,
    };
  }
}
