import type { SimHttpApiPathParameters } from "../path/sim-http-api-path-parameters.js";
import type { SimHttpApiRoutePath } from "../path/sim-http-api-route-path.js";
import {
  fullMatchTier,
  greedyMatchTier,
  SimHttpApiRouteRank,
} from "../sim-http-api-route-rank.js";
import type { SimHttpApiRouteRequest } from "../sim-http-api-route-request.js";
import type { SimHttpApiRouteMethod } from "./sim-http-api-route-method.js";
import type { SimHttpApiRouteKey } from "./sim-http-api-route-key.js";

interface SimHttpApiMethodRouteKeyProperties {
  readonly method: SimHttpApiRouteMethod;
  readonly path: SimHttpApiRoutePath;
}

/**
 * A route key naming a method and a path, such as `GET /pets/{petId}`.
 */
export class SimHttpApiMethodRouteKey implements SimHttpApiRouteKey {
  public readonly method: SimHttpApiRouteMethod;
  public readonly path: SimHttpApiRoutePath;
  public readonly rank: SimHttpApiRouteRank;

  constructor(properties: SimHttpApiMethodRouteKeyProperties) {
    this.method = properties.method;
    this.path = properties.path;
    this.rank = new SimHttpApiRouteRank({
      tier: this.tier,
      methodRank: this.method.rank,
      segmentRanks: this.path.segmentRanks,
    });
  }

  /**
   * The route key as it was written.
   */
  get text(): string {
    return `${this.method.token} ${this.path.text}`;
  }

  /**
   * The route key with its parameter names erased, which is the identity real
   * API Gateway gives the route.
   */
  get signature(): string {
    return `${this.method.token} ${this.path.signature}`;
  }

  /**
   * Match a request of the right method against this route's path.
   *
   * A request whose path matches and whose method does not simply misses this
   * route, rather than being told it used the wrong method. An HTTP API with
   * nothing else to catch it answers 404 rather than 405, which is observed
   * rather than documented.
   */
  match(request: SimHttpApiRouteRequest): SimHttpApiPathParameters | undefined {
    if (!this.method.matches(request.method)) {
      return undefined;
    }

    return this.path.match(request.segments);
  }

  /**
   * Name this route in an `execute-api` ARN, as `GET/pets/{petId}`.
   *
   * The path is the route key's template, braces and all, rather than the path
   * the request asked for. The method is the request's, since a route key of
   * `ANY /pets` serves a request of any method and the ARN names one method.
   */
  methodAndPath(requestMethod: string): string {
    return `${requestMethod}${this.path.text}`;
  }

  private get tier(): number {
    if (this.path.hasGreedySegment) {
      return greedyMatchTier;
    }

    return fullMatchTier;
  }
}
