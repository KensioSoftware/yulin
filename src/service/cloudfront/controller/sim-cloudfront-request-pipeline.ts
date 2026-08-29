import type { SimCloudFrontControllerDependencies } from "./dependency/sim-cf-controller-dependency.js";
import { simCfRequestEdge } from "../cache/sim-cf-edge.js";
import { simCfDefaultRootObjectRequest } from "./root-object/sim-cf-default-root-object-request.js";

/**
 * Runs a single simulated CloudFront request through its lifecycle:
 * read the edge it arrived at, route to a Distribution, put the request
 * through the Distribution's web ACL, apply the default root object, resolve
 * the matching Behavior, run viewer-request hooks, answer from that edge's
 * cache or from the Origin, apply the Behavior's response headers policy, then
 * run viewer-response hooks where the Origin did not answer with an error.
 *
 * A viewer hook is a CloudFront Function or a Lambda@Edge function. A Behavior
 * carries at most one of the two kinds at the viewer events, which
 * `SimCfEdgeAssociationValidator` refuses to configure otherwise. The two
 * applicators below run one after the other and only one of them acts.
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
    // The edge is read first and its header taken off the request. A web ACL
    // rule, an edge function and the Origin therefore never see an instruction
    // that was addressed to the simulator.
    const edge = simCfRequestEdge(request);
    let requestReference = edge.request;

    const route = this.stages.distroRouter.routeForRequest(requestReference);

    if (route === undefined) {
      return new Response("Suitable sim CloudFront Distribution not found", {
        status: 404,
      });
    }

    const { cloudFront, distribution: distro } = route;

    // Put the request through the Distribution's web ACL, if it has one.
    // CloudFront asks WAF before any content handling, so a blocked request is
    // answered at the edge without a Behavior, a CloudFront Function or the
    // Origin ever seeing it.
    const webAclResult = await this.stages.webAclGuard.apply(
      requestReference,
      distro,
    );
    if (webAclResult instanceof Response) {
      return webAclResult;
    }
    requestReference = webAclResult;

    requestReference = simCfDefaultRootObjectRequest(requestReference, distro);

    const behaviour = this.stages.behaviourResolver.resolve(
      requestReference,
      distro,
    );

    // Handle viewer-request CFF, if any.
    // A viewer-request CFF can either rewrite the Request that continues to the
    // Origin or short-circuit the request by returning a Response.
    const cffResult = await this.stages.cffApplicator.applyViewerRequest(
      cloudFront,
      requestReference,
      behaviour,
    );
    if (cffResult instanceof Response) {
      return cffResult;
    }
    requestReference = cffResult;

    // Handle viewer-request Lambda@Edge, if any. A handler answers with the
    // request to send to the Origin or with a response of its own, the same
    // two outcomes a CloudFront Function has.
    const edgeResult = await this.stages.edgeApplicator.applyViewerRequest(
      requestReference,
      distro,
      behaviour,
    );
    if (edgeResult instanceof Response) {
      return edgeResult;
    }
    requestReference = edgeResult;

    // Answer from this edge's cache where it holds the key, and from the Origin
    // where it does not. A miss runs the origin-request and origin-response
    // Lambda@Edge functions either side of the fetch, has an Origin error
    // replaced with the Distribution's custom error page, and is stored.
    const content = await this.stages.contentStage.serve({
      request: requestReference,
      cloudFront,
      distribution: distro,
      behaviour,
      edgeId: edge.edgeId,
    });

    // Apply the Behavior's response headers policy, if it names one. CloudFront
    // does this after the response leaves the cache and before the
    // viewer-response event, so the custom error page above carries the
    // policy's headers and a viewer-response function that runs sees them.
    const response = this.stages.responseHeadersApplicator.apply(
      cloudFront,
      requestReference,
      content.response,
      behaviour,
    );

    // CloudFront runs no viewer-response function when the Origin answered
    // 400 or higher, for either kind of function. The status that decides it
    // is the one the Origin returned, or the one it returned when the cache
    // entry being served was stored. Neither a custom error response carrying
    // `ResponseCode: 200` nor an origin-response function that replaced the
    // status brings the function back.
    if (content.originStatus >= 400) {
      return response;
    }

    // Handle viewer-response CFF, if any.
    // A viewer-response CFF can inspect the original request and replace or
    // modify the Origin response before it is returned to the caller.
    const cffResponse = await this.stages.cffApplicator.applyViewerResponse(
      cloudFront,
      requestReference,
      response,
      behaviour,
    );

    // Handle viewer-response Lambda@Edge, if any.
    return await this.stages.edgeApplicator.applyViewerResponse(
      requestReference,
      cffResponse,
      distro,
      behaviour,
    );
  }
}
