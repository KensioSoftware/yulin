import { randomUUID } from "node:crypto";

import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { SimLambdaEdgeRequestAdapter } from "./sim-lambda-edge-request-adapter.js";
import { SimLambdaEdgeResponseAdapter } from "./sim-lambda-edge-response-adapter.js";

/**
 * Which Distribution an edge function is told it is running for.
 */
export interface SimLambdaEdgeDistributionConfig {
  readonly distributionId: string;
  readonly distributionDomainName: string;
}

/**
 * Converts between native Fetch API Request and Response objects and the
 * Lambda@Edge event and result shapes.
 */
export class SimLambdaEdgeEventAdapter {
  private readonly requestAdapter = new SimLambdaEdgeRequestAdapter();
  private readonly responseAdapter = new SimLambdaEdgeResponseAdapter();

  /**
   * Build the event a viewer-request function is invoked with.
   */
  async toRequestEvent(
    request: Request,
    includeBody: boolean,
    distribution: SimLambdaEdgeDistributionConfig,
  ): Promise<LambdaAtEdge.RequestEvent> {
    return {
      Records: [
        {
          cf: {
            config: this.config(distribution, "viewer-request"),
            request: await this.requestAdapter.toEdgeRequest(
              request,
              includeBody,
            ),
          },
        },
      ],
    };
  }

  /**
   * Build the event a viewer-response function is invoked with.
   *
   * The request travels with the response, and it never carries a body. Real
   * CloudFront has already forwarded the request by this point, and
   * `IncludeBody` applies to viewer-request and origin-request events only.
   */
  async toResponseEvent(
    request: Request,
    response: Response,
    distribution: SimLambdaEdgeDistributionConfig,
  ): Promise<LambdaAtEdge.ResponseEvent> {
    return {
      Records: [
        {
          cf: {
            config: this.config(distribution, "viewer-response"),
            request: await this.requestAdapter.toEdgeRequest(request, false),
            response: this.responseAdapter.toEdgeResponse(response),
          },
        },
      ],
    };
  }

  /**
   * Read what a viewer-request handler answered with.
   *
   * A result carrying a status is a response the viewer gets. Anything else is
   * the request carrying on to the origin.
   */
  fromRequestResult(
    result: LambdaAtEdge.RequestResult,
    originalRequest: Request,
  ): Request | Response {
    return isEdgeResponse(result)
      ? this.responseAdapter.fromEdgeResponse(result)
      : this.requestAdapter.fromEdgeRequest(result, originalRequest);
  }

  /**
   * Read what a viewer-response handler answered with.
   */
  fromResponseResult(
    result: LambdaAtEdge.Response,
    originalResponse: Response,
  ): Response {
    return this.responseAdapter.fromEdgeViewerResponse(
      result,
      originalResponse,
    );
  }

  private config<TEvent extends LambdaAtEdge.EventType>(
    distribution: SimLambdaEdgeDistributionConfig,
    eventType: TEvent,
  ): LambdaAtEdge.Config & { eventType: TEvent } {
    return {
      distributionId: distribution.distributionId,
      distributionDomainName: distribution.distributionDomainName,
      eventType,
      requestId: randomUUID(),
    };
  }
}

/**
 * Whether a viewer-request handler answered with a response.
 */
function isEdgeResponse(
  result: LambdaAtEdge.RequestResult,
): result is LambdaAtEdge.Response {
  return "status" in result;
}
