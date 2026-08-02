import type { SimHttpApiPathParameters } from "../path/sim-http-api-path-parameters.js";
import type { SimHttpApiRouteRank } from "../sim-http-api-route-rank.js";
import type { SimHttpApiRouteRequest } from "../sim-http-api-route-request.js";

/**
 * A parsed route key: what decides whether a route serves a request, and what
 * it captures from the path when it does.
 *
 * There are two of these, the `$default` catch-all and a method with a path,
 * and they answer the same questions differently rather than the caller asking
 * which one it has.
 */
export interface SimHttpApiRouteKey {
  /** The route key as it was written, which is what `RouteKey` reports. */
  readonly text: string;
  /**
   * The route key with parameter names erased, which is the identity real API
   * Gateway gives a route: `GET /pets/{id}` and `GET /pets/{petId}` are one
   * route and the second is a conflict.
   */
  readonly signature: string;
  /** How specific this route is, for choosing between matching routes. */
  readonly rank: SimHttpApiRouteRank;
  /**
   * The path parameters this route captures from a request it matches, or
   * nothing when it does not match.
   */
  match(request: SimHttpApiRouteRequest): SimHttpApiPathParameters | undefined;
  /**
   * How this route names itself in an `execute-api` ARN, given the method of
   * the request that matched it.
   *
   * The method is the request's rather than the route's, because a route key
   * of `ANY /pets` is matched by a `GET` request and API Gateway puts a
   * concrete verb in the ARN. `SimHttpApiExecuteApiArn` has the reasoning.
   */
  methodAndPath(requestMethod: string): string;
}
