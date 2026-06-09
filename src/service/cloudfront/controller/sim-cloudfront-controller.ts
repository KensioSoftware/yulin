import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import type { SimCloudFrontDistroRouter } from "../router/sim-cloud-front-distro-router.js";
import { SimCloudFrontDistroRouter as DefaultSimCloudFrontDistroRouter } from "../router/sim-cloud-front-distro-router.js";
import type { SimCloudFrontBehaviorResolver } from "../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCloudFrontBehaviorResolver as DefaultSimCloudFrontBehaviorResolver } from "../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCloudFront } from "../sim-cloudfront.js";

/**
 * Root CloudFront request controller within an Account scope.
 * Controls the request processing workflow across the other simulated
 * CloudFront components.
 */
export class SimCloudFrontServiceController implements SimAwsServiceController {
  private readonly distroRouter: SimCloudFrontDistroRouter;
  private readonly behaviourResolver: SimCloudFrontBehaviorResolver;

  constructor(
    cloudFront: SimCloudFront = new SimCloudFront(),
    distroRouter: SimCloudFrontDistroRouter = new DefaultSimCloudFrontDistroRouter(
      cloudFront.getDistributions(),
    ),
    behaviourResolver: SimCloudFrontBehaviorResolver = new DefaultSimCloudFrontBehaviorResolver(),
  ) {
    this.distroRouter = distroRouter;
    this.behaviourResolver = behaviourResolver;
  }

  /**
   * Handle a sim CloudFront request by coordinating across other sim CloudFront
   * components.
   */
  async handleRequest(
    _target: SimAwsServiceTarget,
    req: Request,
  ): Promise<Response> {
    const distro = this.distroRouter.distroForRequest(req);

    if (distro === undefined) {
      return new Response("Suitable sim CloudFront Distribution not found", {
        status: 404,
      });
    }

    const behaviour = this.behaviourResolver.resolve(req, distro);

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
      req,
      distribution: distro,
      behavior: behaviour,
    });
  }
}
