import { randomUUID } from "node:crypto";

import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { SimCffRequestResponseAdapter } from "./sim-cff-request-response-adapter.js";

/**
 * Converts between native Fetch API Request/Response objects and the
 * CloudFront Function event/request/response shapes.
 */
export class SimCffEventAdapter {
  private readonly requestResponseAdapter = new SimCffRequestResponseAdapter();

  /**
   * Adapt a Request into a ViewerRequestEvent.
   */
  toViewerRequestEvent(req: Request): CloudFrontFunction.ViewerRequestEvent {
    return {
      context: {
        eventType: "viewer-request",
        requestId: randomUUID(),
      },
      viewer: {
        ip: "127.0.0.1",
      },
      request: this.requestResponseAdapter.toCffRequest(req),
    };
  }

  /**
   * Adapt a Request and Response into a ViewerResponseEvent.
   */
  toViewerResponseEvent(
    req: Request,
    res: Response,
  ): CloudFrontFunction.ViewerResponseEvent {
    return {
      context: {
        eventType: "viewer-response",
        requestId: randomUUID(),
      },
      viewer: {
        ip: "127.0.0.1",
      },
      request: this.requestResponseAdapter.toCffRequest(req),
      response: this.requestResponseAdapter.toCffResponse(res),
    };
  }

  /**
   * Adapt a viewer-request CFF result into a Request or Response.
   */
  fromViewerRequestResult(
    result: CloudFrontFunction.Request | CloudFrontFunction.Response,
    originalReq: Request,
  ): Request | Response {
    if (this.isCffResponse(result)) {
      return this.requestResponseAdapter.fromCffResponse(result);
    }

    return this.requestResponseAdapter.fromCffRequest(result, originalReq);
  }

  /**
   * Adapt a viewer-response CFF result into a Response.
   */
  fromViewerResponseResult(
    result: CloudFrontFunction.Response,
    originalResponse: Response,
  ): Response {
    return this.requestResponseAdapter.fromCffViewerResponse(
      result,
      originalResponse,
    );
  }

  private isCffResponse(
    result: CloudFrontFunction.Request | CloudFrontFunction.Response,
  ): result is CloudFrontFunction.Response {
    return "statusCode" in result;
  }
}
