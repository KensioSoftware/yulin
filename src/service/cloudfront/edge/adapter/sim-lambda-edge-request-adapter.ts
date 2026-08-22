import { simAwsRequestHostname } from "../../../../serve/http/url/sim-aws-request-hostname.js";
import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { edgeRequestBody, replacementBody } from "./sim-lambda-edge-body.js";
import { fromEdgeHeaders, toEdgeHeaders } from "./sim-lambda-edge-headers.js";

/**
 * The client IP a simulated edge function is told the request came from.
 *
 * Everything reaching the simulator arrives in process, so there is no viewer
 * address to report. The CloudFront Functions adapter reports the same one.
 */
const simEdgeClientIp = "127.0.0.1";

/**
 * Converts a Fetch API Request into the Lambda@Edge request shape, and a
 * handler's request back again. `SimLambdaEdgeResponseAdapter` does the same
 * for a response.
 */
export class SimLambdaEdgeRequestAdapter {
  /**
   * Convert a Node fetch Request into the Lambda@Edge request shape.
   *
   * The body is read only when the association asked for it, because
   * CloudFront sends one only where `IncludeBody` is set and reading it here
   * would otherwise consume a stream nothing wants.
   */
  async toEdgeRequest(
    request: Request,
    includeBody: boolean,
  ): Promise<LambdaAtEdge.Request> {
    const url = new URL(request.url);

    return {
      clientIp: simEdgeClientIp,
      method: request.method,
      uri: url.pathname,
      querystring: url.search.replace(/^\?/u, ""),
      headers: this.viewerEdgeHeaders(request),
      ...(includeBody && { body: await edgeRequestBody(request) }),
    };
  }

  /**
   * Convert a handler's request back into a Node fetch Request.
   */
  fromEdgeRequest(
    edgeRequest: LambdaAtEdge.Request,
    originalRequest: Request,
  ): Request {
    const url = new URL(originalRequest.url);
    url.pathname = edgeRequest.uri;
    url.search = edgeRequest.querystring;

    const headers = fromEdgeHeaders(edgeRequest.headers);
    restoreViewerHost(headers, originalRequest);

    return new Request(url, {
      method: edgeRequest.method,
      headers,
      body: replacementBody(edgeRequest, originalRequest),
      duplex: "half",
      redirect: originalRequest.redirect,
      signal: originalRequest.signal,
    });
  }

  /**
   * Request headers as the edge function sees them, with the host CloudFront
   * presents.
   *
   * A request served on localhost arrives with the Yulin-local host, and the
   * function is told the Distribution domain name or alternate domain name the
   * viewer used, as it would be on AWS.
   */
  private viewerEdgeHeaders(request: Request): LambdaAtEdge.Headers {
    const headers = toEdgeHeaders(request.headers);
    headers["host"] = [{ key: "Host", value: simAwsRequestHostname(request) }];

    return headers;
  }
}

/**
 * Restore the host the request arrived with.
 *
 * `Host` is read-only in a viewer-request event, so a host a handler wrote is
 * discarded. That also keeps the Yulin-local host on the request continuing to
 * the origin, which is the name the rest of the simulation resolves.
 */
function restoreViewerHost(headers: Headers, originalRequest: Request): void {
  const viewerHost = originalRequest.headers.get("host");

  if (viewerHost === null) {
    headers.delete("host");
    return;
  }

  headers.set("host", viewerHost);
}
