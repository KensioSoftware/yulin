import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimCloudFrontOrigin } from "../../origin/sim-cloudfront-origin.js";

/**
 * Fetches a request from the Behavior's configured CloudFront Origin.
 */
export class SimCloudFrontOriginFetcher {
  /**
   * Fetch the request from the Origin targeted by the resolved Behavior.
   *
   * An Origin passed in is fetched from instead of the one the Behavior
   * targets, which is how an origin-request function's rewriting reaches the
   * fetch.
   */
  async fetch(
    request: Request,
    distro: SimCloudFrontDistribution,
    behaviour: SimCloudFrontBehavior,
    targetOrigin?: SimCloudFrontOrigin,
  ): Promise<Response> {
    const origin = targetOrigin ?? distro.getOrigin(behaviour.targetOriginName);
    if (origin === undefined) {
      return new Response(
        `Sim CloudFront Distribution misconfigured for Origin ${behaviour.targetOriginName}`,
        {
          status: 501,
        },
      );
    }

    return await origin.fetch({
      req: request,
      distribution: distro,
      behavior: behaviour,
    });
  }
}
