/**
 * What a route key says about the request that reached it.
 *
 * A route key naming a method and a path says both; `$default` says neither,
 * and neither does a key whose path is a template rather than the path a
 * request actually asked for.
 */
export interface SimPayload2RequestLine {
  readonly method?: string | undefined;
  readonly path?: string | undefined;
}

/**
 * What one kind of payload format 2.0 endpoint calls itself.
 *
 * Both kinds deliver the same event, and these are the fields where they
 * differ: a Function URL is its own `$default` route on a `$default` stage
 * under `lambda-url`, while an HTTP API has real routes and stages under
 * `execute-api`. Keeping the difference here is what lets one factory make the
 * events of both.
 */
export interface SimPayload2EndpointStyle {
  /** Allocate an endpoint id, as creating such an endpoint would. */
  readonly makeEndpointId: () => string;
  /** The AWS hostname an endpoint of this kind answers on. */
  readonly hostname: (endpointId: string) => string;
  /** The stage an invocation of this kind of endpoint reports. */
  readonly stage: string;
  /** The route key an invocation of this request reports. */
  readonly routeKeyFor: (method: string, path: string) => string;
  /** What a route key of this kind says about the request. */
  readonly requestLineFor: (routeKey: string) => SimPayload2RequestLine;
}
