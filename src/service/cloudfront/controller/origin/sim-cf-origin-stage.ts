import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimLambdaEdgeOriginApplicator } from "../edge/sim-lambda-edge-origin-applicator.js";
import type { SimCloudFrontOriginFetcher } from "./sim-cloudfront-origin-fetcher.js";

/**
 * What the Origin stage produced for the rest of the pipeline.
 */
export interface SimCfOriginStageResult {
  /**
   * The response carrying on towards the viewer.
   */
  readonly response: Response;

  /**
   * The status the Origin answered with, before an origin-response function
   * could replace it.
   *
   * The pipeline reads this to decide whether a viewer-response function runs,
   * so a 500 an origin-response function turned into a 200 still counts as the
   * Origin error it was. A response an origin-request function generated has
   * no Origin status behind it, and its own status stands in.
   */
  readonly originStatus: number;
}

/**
 * Fetches from the Behavior's Origin, running the Lambda@Edge functions on
 * either side of the fetch.
 *
 * Real CloudFront runs the origin events on a cache miss only. Nothing here
 * caches, so every request is a miss and both events run every time.
 */
export class SimCfOriginStage {
  constructor(
    private readonly originFetcher: SimCloudFrontOriginFetcher,
    private readonly edgeOriginApplicator: SimLambdaEdgeOriginApplicator,
  ) {}

  /**
   * Take one request through the origin-request event, the fetch and the
   * origin-response event.
   */
  async fetch(
    request: Request,
    distribution: SimCloudFrontDistribution,
    behaviour: SimCloudFrontBehavior,
  ): Promise<SimCfOriginStageResult> {
    const origin = distribution.getOrigin(behaviour.targetOriginName);

    // A Behavior naming an Origin the Distribution does not hold has nothing
    // to tell an origin-request function about, and the fetcher answers with
    // the same misconfiguration response it always has.
    if (origin === undefined) {
      return this.fetched(
        await this.originFetcher.fetch(request, distribution, behaviour),
      );
    }

    const bound = await this.edgeOriginApplicator.applyOriginRequest(
      { request, origin },
      distribution,
      behaviour,
    );

    // A response the origin-request function generated answers the viewer
    // without the Origin being read, and the origin-response function has no
    // Origin response to run on.
    if (bound instanceof Response) {
      return this.fetched(bound);
    }

    const response = await this.originFetcher.fetch(
      bound.request,
      distribution,
      behaviour,
      bound.origin,
    );

    return {
      response: await this.edgeOriginApplicator.applyOriginResponse(
        bound,
        response,
        distribution,
        behaviour,
      ),
      originStatus: response.status,
    };
  }

  /**
   * A response nothing ran after, whose own status is the Origin's.
   */
  private fetched(response: Response): SimCfOriginStageResult {
    return { response, originStatus: response.status };
  }
}
