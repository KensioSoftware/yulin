import type { SimCloudFrontDistroRouter } from "../router/sim-cloud-front-distro-router.js";
import type { SimCloudFrontBehaviorResolver } from "../resolver/sim-cloud-front-behavior-resolver.js";
import type { SimCffApplicator } from "./cff/sim-cff-applicator.js";
import type { SimCloudFrontOriginFetcher } from "./origin/sim-cloudfront-origin-fetcher.js";
import type { SimCloudFrontControllerDependencies } from "./dependency/sim-cf-controller-dependency.js";
import type { SimCfCustomErrorResponder } from "./error/sim-cf-custom-error-responder.js";
import { simCfDefaultRootObjectRequest } from "./root-object/sim-cf-default-root-object-request.js";

/**
 * Runs a single simulated CloudFront request through its lifecycle:
 * route to a Distribution, apply the default root object, resolve the matching
 * Behavior, run viewer-request hooks, fetch from the Origin, replace an error
 * response with the Distribution's custom error page, then run viewer-response
 * hooks.
 *
 * This is the request-processing core, kept separate from the service
 * controller so the controller stays a thin adapter to the shared
 * service-controller interface and this class stays focused on the ordered
 * pipeline itself.
 */
export class SimCloudFrontRequestPipeline {
  private readonly distroRouter: SimCloudFrontDistroRouter;
  private readonly behaviourResolver: SimCloudFrontBehaviorResolver;
  private readonly cffApplicator: SimCffApplicator;
  private readonly originFetcher: SimCloudFrontOriginFetcher;
  private readonly customErrorResponder: SimCfCustomErrorResponder;

  constructor(dependencies: SimCloudFrontControllerDependencies) {
    this.distroRouter = dependencies.distroRouter;
    this.behaviourResolver = dependencies.behaviourResolver;
    this.cffApplicator = dependencies.cffApplicator;
    this.originFetcher = dependencies.originFetcher;
    this.customErrorResponder = dependencies.customErrorResponder;
  }

  /**
   * Process one incoming request and produce the response the caller sees.
   */
  async handle(request: Request): Promise<Response> {
    let requestReference = request;

    const route = this.distroRouter.routeForRequest(requestReference);

    if (route === undefined) {
      return new Response("Suitable sim CloudFront Distribution not found", {
        status: 404,
      });
    }

    const { cloudFront, distribution: distro } = route;

    requestReference = simCfDefaultRootObjectRequest(requestReference, distro);

    const behaviour = this.behaviourResolver.resolve(requestReference, distro);

    // Handle viewer-request CFF, if any.
    // A viewer-request CFF can either rewrite the Request that continues to the
    // Origin or short-circuit the request by returning a Response.
    const cffResult = this.cffApplicator.applyViewerRequest(
      cloudFront,
      requestReference,
      behaviour,
    );
    if (cffResult instanceof Response) {
      return cffResult;
    }
    requestReference = cffResult;

    const originResponse = await this.originFetcher.fetch(
      requestReference,
      distro,
      behaviour,
    );

    // Replace an Origin error with the Distribution's custom error page, if it
    // configures one for that status. This happens before the viewer-response
    // CFF so that a function sees the response the viewer is about to get.
    const response = await this.customErrorResponder.apply(
      requestReference,
      distro,
      originResponse,
    );

    // Handle viewer-response CFF, if any.
    // A viewer-response CFF can inspect the original request and replace or
    // modify the Origin response before it is returned to the caller.
    return this.cffApplicator.applyViewerResponse(
      cloudFront,
      requestReference,
      response,
      behaviour,
    );
  }
}
