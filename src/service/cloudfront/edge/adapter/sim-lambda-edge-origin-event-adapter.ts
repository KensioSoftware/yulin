import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import {
  edgeEventConfig,
  type SimLambdaEdgeDistributionConfig,
} from "./sim-lambda-edge-event-config.js";
import { SimLambdaEdgeRequestAdapter } from "./sim-lambda-edge-request-adapter.js";
import { SimLambdaEdgeResponseAdapter } from "./sim-lambda-edge-response-adapter.js";

/**
 * What an origin-request handler left for the fetch to use. The request to send
 * travels with the Origin to send it to.
 */
export interface SimLambdaEdgeOriginRequest {
  readonly request: Request;
  readonly origin: LambdaAtEdge.Origin;
}

/**
 * Converts between Fetch API objects and the shapes the two origin events
 * carry. `SimLambdaEdgeEventAdapter` does the same for the viewer events.
 *
 * The Origin is what sets an origin event apart. The request carries the one
 * the fetch is about to read, and a handler rewriting it sends the fetch
 * somewhere else.
 */
export class SimLambdaEdgeOriginEventAdapter {
  private readonly requestAdapter = new SimLambdaEdgeRequestAdapter();
  private readonly responseAdapter = new SimLambdaEdgeResponseAdapter();

  /**
   * Build the event an origin-request function is invoked with.
   *
   * The event carries the Origin the Behavior resolved, which is what the
   * handler reads to find out where the request is going and rewrites to send
   * it somewhere else.
   */
  async toOriginRequestEvent(
    request: Request,
    includeBody: boolean,
    distribution: SimLambdaEdgeDistributionConfig,
    origin: LambdaAtEdge.Origin,
  ): Promise<LambdaAtEdge.OriginRequestEvent> {
    return {
      Records: [
        {
          cf: {
            config: edgeEventConfig(distribution, "origin-request"),
            request: await this.requestAdapter.toOriginEdgeRequest(
              request,
              includeBody,
              origin,
            ),
          },
        },
      ],
    };
  }

  /**
   * Build the event an origin-response function is invoked with.
   *
   * The request travels with the response and carries no body, for the same
   * reason a viewer-response event's does not. CloudFront has sent the request
   * on by this point.
   */
  async toOriginResponseEvent(
    request: Request,
    response: Response,
    distribution: SimLambdaEdgeDistributionConfig,
    origin: LambdaAtEdge.Origin,
  ): Promise<LambdaAtEdge.OriginResponseEvent> {
    return {
      Records: [
        {
          cf: {
            config: edgeEventConfig(distribution, "origin-response"),
            request: await this.requestAdapter.toOriginEdgeRequest(
              request,
              false,
              origin,
            ),
            response: this.responseAdapter.toEdgeResponse(response),
          },
        },
      ],
    };
  }

  /**
   * Read what an origin-request handler answered with.
   *
   * A result carrying a status is a response the viewer gets without the
   * Origin being read. Anything else is the request carrying on, with whatever
   * Origin the handler left on it.
   */
  fromOriginRequestResult(
    result: LambdaAtEdge.RequestResult,
    originalRequest: Request,
    origin: LambdaAtEdge.Origin,
  ): SimLambdaEdgeOriginRequest | Response {
    if (isEdgeResponse(result)) {
      return this.responseAdapter.fromEdgeResponse(result);
    }

    return {
      request: this.requestAdapter.fromEdgeRequest(result, originalRequest),
      origin: result.origin ?? origin,
    };
  }

  /**
   * Read what an origin-response handler answered with.
   */
  fromResponseResult(
    result: LambdaAtEdge.Response,
    originalResponse: Response,
  ): Response {
    return this.responseAdapter.fromEdgeHandlerResponse(
      result,
      originalResponse,
    );
  }
}

/**
 * Whether an origin-request handler answered with a response.
 */
function isEdgeResponse(
  result: LambdaAtEdge.RequestResult,
): result is LambdaAtEdge.Response {
  return "status" in result;
}
