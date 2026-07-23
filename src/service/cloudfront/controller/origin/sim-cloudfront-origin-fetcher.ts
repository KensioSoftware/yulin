import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

/**
 * Fetches a request from the Behavior's configured CloudFront Origin.
 */
export class SimCloudFrontOriginFetcher {
  /**
   * Fetch the request from the Origin targeted by the resolved Behavior.
   */
  async fetch(
    request: Request,
    distro: SimCloudFrontDistribution,
    behaviour: SimCloudFrontBehavior,
  ): Promise<Response> {
    const origin = distro.getOrigin(behaviour.targetOriginName);
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
