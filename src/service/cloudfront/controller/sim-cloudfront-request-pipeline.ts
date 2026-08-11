import type { SimCloudFrontControllerDependencies } from "./dependency/sim-cf-controller-dependency.js";
import { simCfDefaultRootObjectRequest } from "./root-object/sim-cf-default-root-object-request.js";

/**
 * Runs a single simulated CloudFront request through its lifecycle:
 * route to a Distribution, apply the default root object, resolve the matching
 * Behavior, run viewer-request hooks, fetch from the Origin, replace an error
 * response with the Distribution's custom error page, apply the Behavior's
 * response headers policy, then run viewer-response hooks.
 *
 * This is the request-processing core, kept separate from the service
 * controller so the controller stays a thin adapter to the shared
 * service-controller interface and this class stays focused on the ordered
 * pipeline itself.
 */
export class SimCloudFrontRequestPipeline {
  constructor(private readonly stages: SimCloudFrontControllerDependencies) {}

  /**
   * Process one incoming request and produce the response the caller sees.
   */
  async handle(request: Request): Promise<Response> {
    let requestReference = request;

    const route = this.stages.distroRouter.routeForRequest(requestReference);

    if (route === undefined) {
      return new Response("Suitable sim CloudFront Distribution not found", {
        status: 404,
      });
    }

    const { cloudFront, distribution: distro } = route;

    requestReference = simCfDefaultRootObjectRequest(requestReference, distro);

    const behaviour = this.stages.behaviourResolver.resolve(
      requestReference,
      distro,
    );

    // Handle viewer-request CFF, if any.
    // A viewer-request CFF can either rewrite the Request that continues to the
    // Origin or short-circuit the request by returning a Response.
    const cffResult = this.stages.cffApplicator.applyViewerRequest(
      cloudFront,
      requestReference,
      behaviour,
    );
    if (cffResult instanceof Response) {
      return cffResult;
    }
    requestReference = cffResult;

    const originResponse = await this.stages.originFetcher.fetch(
      requestReference,
      distro,
      behaviour,
    );

    // Replace an Origin error with the Distribution's custom error page, if it
    // configures one for that status. This happens before the viewer-response
    // CFF so that a function sees the response the viewer is about to get.
    const errorResponse = await this.stages.customErrorResponder.apply(
      requestReference,
      distro,
      originResponse,
    );

    // Apply the Behavior's response headers policy, if it names one. CloudFront
    // does this after the response leaves the cache and before the
    // viewer-response event, so the custom error page above carries the
    // policy's headers and a viewer-response function sees them.
    const response = this.stages.responseHeadersApplicator.apply(
      cloudFront,
      requestReference,
      errorResponse,
      behaviour,
    );

    // Handle viewer-response CFF, if any.
    // A viewer-response CFF can inspect the original request and replace or
    // modify the Origin response before it is returned to the caller.
    return this.stages.cffApplicator.applyViewerResponse(
      cloudFront,
      requestReference,
      response,
      behaviour,
    );
  }
}
