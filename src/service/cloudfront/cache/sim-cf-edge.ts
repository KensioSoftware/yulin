/**
 * The header naming the CloudFront edge a request arrives at.
 *
 * CloudFront caches at each of its several hundred points of presence, so a
 * viewer is never guaranteed the entry another viewer's request stored. A
 * request naming an edge of its own is answered from that edge's cache, which
 * is how a test proves its app survives arriving somewhere cold.
 *
 * The name follows the `x-sim-aws-*` convention of `simAwsControlHeaderNames`,
 * and like those headers it states something to the simulator rather than to
 * the application. Sim CloudFront reads it, drops it from the request, and
 * nothing downstream of the edge sees it.
 */
export const simCfEdgeHeaderName = "x-sim-aws-cloudfront-edge";

/**
 * The edge a request arrives at when it names none.
 *
 * Every request in a test lands here unless the test says otherwise, and a
 * second request for a key the first one stored is a hit.
 */
export const simCfDefaultEdgeId = "default";

/**
 * A request and the edge it arrived at.
 */
export interface SimCfRequestEdge {
  readonly edgeId: string;

  /**
   * The request with the edge header removed, which is the one the rest of the
   * pipeline works on.
   */
  readonly request: Request;
}

/**
 * Read the edge a request arrived at, and take the header back off it.
 */
export function simCfRequestEdge(request: Request): SimCfRequestEdge {
  const named = request.headers.get(simCfEdgeHeaderName)?.trim();

  if (named === undefined) {
    return { edgeId: simCfDefaultEdgeId, request };
  }

  const headers = new Headers(request.headers);
  headers.delete(simCfEdgeHeaderName);

  return { edgeId: named, request: new Request(request, { headers }) };
}
