import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { edgeResponseBody } from "./sim-lambda-edge-body.js";
import { fromEdgeHeaders, toEdgeHeaders } from "./sim-lambda-edge-headers.js";

/**
 * Converts between Fetch API Response objects and the Lambda@Edge response
 * shape.
 */
export class SimLambdaEdgeResponseAdapter {
  /**
   * Convert a Node fetch Response into the Lambda@Edge response shape.
   */
  toEdgeResponse(response: Response): LambdaAtEdge.Response {
    return {
      status: String(response.status),
      statusDescription: response.statusText,
      headers: toEdgeHeaders(response.headers),
    };
  }

  /**
   * Convert a handler's generated response into a Node fetch Response.
   */
  fromEdgeResponse(edgeResponse: LambdaAtEdge.Response): Response {
    return new Response(edgeResponseBody(edgeResponse), {
      status: Number(edgeResponse.status),
      statusText: edgeResponse.statusDescription ?? "",
      headers: fromEdgeHeaders(edgeResponse.headers),
    });
  }

  /**
   * Convert a viewer-response handler's result into a Node fetch Response,
   * keeping the origin's body.
   *
   * A viewer-response event carries no body, and a handler that returns
   * `event.Records[0].cf.response` returns none either. Treating that as an
   * empty body would drop the page while leaving the origin's content-length
   * header describing it. A handler that did write a body replaces it.
   */
  fromEdgeViewerResponse(
    edgeResponse: LambdaAtEdge.Response,
    originalResponse: Response,
  ): Response {
    return new Response(
      edgeResponse.body === undefined
        ? originalResponse.body
        : edgeResponseBody(edgeResponse),
      {
        status: Number(edgeResponse.status),
        statusText: edgeResponse.statusDescription ?? "",
        headers: fromEdgeHeaders(edgeResponse.headers),
      },
    );
  }
}
