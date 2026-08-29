import { simCfCacheableRequest } from "../../cache/sim-cf-cacheable-request.js";
import { simCfCacheTtlSec } from "../../cache/sim-cf-cache-ttl.js";
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
 * holds unexpired is answered with the Origin left unread. A miss goes to the
 * Origin, has an error replaced with the Distribution's custom error page, and
 * is stored under the key it missed on for as long as the Origin's headers and
 * the cache policy between them allow.
 *
 * An error stays out of the cache, whether the Origin answered with it or an
 * origin-response function made one of an Origin's answer. Real CloudFront
 * holds one for `ErrorCachingMinTTL`, which is a TTL of its own rather than the
 * one the Origin's headers ask for.
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
    const cacheable = simCfCacheableRequest(content);
    const cached =
      cacheable === undefined
        ? undefined
        : distribution.cache.read(cacheable.key);

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

    if (
      cacheable === undefined ||
      originResult.originStatus >= 400 ||
      response.status >= 400
    ) {
      return { response, originStatus: originResult.originStatus };
    }

    return {
      response: await distribution.cache.store(
        cacheable.key,
        response,
        simCfCacheTtlSec({
          response,
          policy: cacheable.policy,
          now: distribution.clock.now(),
        }),
      ),
      originStatus: originResult.originStatus,
    };
  }
}
