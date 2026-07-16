import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import type { SimCloudFrontDistroRouter } from "../router/sim-cloud-front-distro-router.js";
import type { SimCloudFrontBehaviorResolver } from "../resolver/sim-cloud-front-behavior-resolver.js";
import type { SimCffApplicator } from "./cff/sim-cff-applicator.js";
import type { SimCloudFrontOriginFetcher } from "./origin/sim-cloudfront-origin-fetcher.js";
import {
  SimCloudFrontControllerDependenciesFactory,
  type SimCloudFrontServiceControllerProps,
} from "./dependency/sim-cf-controller-dependency.js";

/**
 * Root HTTP entry point for simulated CloudFront requests.
 *
 * This class coordinates the high-level request lifecycle:
 * route to a Distribution, resolve the matching Behavior, run viewer hooks,
 * fetch from the Origin, then run response hooks.
 *
 * Construction of default collaborators is kept in the dependency factory, so
 * this controller stays focused on request orchestration.
 */
export class SimCloudFrontServiceController implements SimAwsServiceController {
  private readonly distroRouter: SimCloudFrontDistroRouter;
  private readonly behaviourResolver: SimCloudFrontBehaviorResolver;
  private readonly cffApplicator: SimCffApplicator;
  private readonly originFetcher: SimCloudFrontOriginFetcher;

  constructor(props: SimCloudFrontServiceControllerProps = {}) {
    const dependenciesFactory =
      new SimCloudFrontControllerDependenciesFactory();
    const { distroRouter, behaviourResolver, cffApplicator, originFetcher } =
      dependenciesFactory.make(props);

    this.distroRouter = distroRouter;
    this.behaviourResolver = behaviourResolver;
    this.cffApplicator = cffApplicator;
    this.originFetcher = originFetcher;
  }

  /**
   * Handle one incoming request for the simulated CloudFront service.
   *
   * The `_target` is part of the shared service-controller interface, but
   * CloudFront routing is host-based, so the request itself contains the
   * information needed to find the Distribution.
   */
  async handleRequest(
    _target: SimAwsServiceTarget,
    request: Request,
  ): Promise<Response> {
    let req = request;

    const route = this.distroRouter.routeForRequest(req);

    if (route === undefined) {
      return new Response("Suitable sim CloudFront Distribution not found", {
        status: 404,
      });
    }

    const { cloudFront, distribution: distro } = route;

    const behaviour = this.behaviourResolver.resolve(req, distro);

    // Handle viewer-request CFF, if any.
    // A viewer-request CFF can either rewrite the Request that continues to the
    // Origin or short-circuit the request by returning a Response.
    const cffResult = this.cffApplicator.applyViewerRequest(
      cloudFront,
      req,
      behaviour,
    );
    if (cffResult instanceof Response) {
      return cffResult;
    }
    req = cffResult;

    const res = await this.originFetcher.fetch(req, distro, behaviour);

    // Handle viewer-response CFF, if any.
    // A viewer-response CFF can inspect the original request and replace or
    // modify the Origin response before it is returned to the caller.
    return this.cffApplicator.applyViewerResponse(
      cloudFront,
      req,
      res,
      behaviour,
    );
  }
}
