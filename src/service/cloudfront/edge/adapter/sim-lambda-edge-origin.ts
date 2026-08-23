import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { fromEdgeHeaders, toEdgeHeaders } from "./sim-lambda-edge-headers.js";

/**
 * Convert an Origin's own custom headers into the Lambda@Edge header shape.
 *
 * An Origin holds one value per header name, and an origin event presents it
 * as the same list of `{ key, value }` pairs every other header arrives as.
 */
export function toEdgeOriginHeaders(
  customHeaders: Readonly<Record<string, string>>,
): LambdaAtEdge.Headers {
  return toEdgeHeaders(new Headers({ ...customHeaders }));
}

/**
 * Convert the custom headers a handler left on the Origin back again.
 *
 * A handler that wrote the same name twice has the values joined, because an
 * Origin sends one value per header name whatever the event carried.
 */
export function fromEdgeOriginHeaders(
  edgeHeaders: LambdaAtEdge.Headers | undefined,
): Record<string, string> {
  return Object.fromEntries(fromEdgeHeaders(edgeHeaders).entries());
}

/**
 * The domain name of the Origin a request is on its way to.
 *
 * An Origin built here is one kind or the other, and both carry a domain name.
 * The empty string is what an Origin with neither would report.
 */
export function edgeOriginDomainName(origin: LambdaAtEdge.Origin): string {
  /* v8 ignore next */
  return origin.custom?.domainName ?? origin.s3?.domainName ?? "";
}
