import type { SimHttpApiPathParameters } from "./path/sim-http-api-path-parameters.js";
import type { SimHttpApiRouteRequest } from "./sim-http-api-route-request.js";
import type { SimHttpApiRoute } from "./sim-http-api-route.js";

interface SimHttpApiRouteSelectionProperties {
  readonly route: SimHttpApiRoute;
  readonly pathParameters: SimHttpApiPathParameters;
}

/**
 * One route that matched a request, with what it captured from the path.
 */
export class SimHttpApiRouteSelection {
  public readonly route: SimHttpApiRoute;
  public readonly pathParameters: SimHttpApiPathParameters;

  constructor(properties: SimHttpApiRouteSelectionProperties) {
    this.route = properties.route;
    this.pathParameters = properties.pathParameters;
  }

  /**
   * Whether this route is the more specific of the two, and so the one that
   * serves the request.
   */
  beats(other: SimHttpApiRouteSelection): boolean {
    return this.route.key.rank.compareTo(other.route.key.rank) < 0;
  }
}

/**
 * Picks the route that serves one request.
 *
 * Every route is asked whether it matches, and the most specific of the ones
 * that do wins. Two routes of an API cannot rank the same for one request,
 * because two route keys that would are the same route key and the second is
 * refused as a conflict when it is created.
 */
export class SimHttpApiRouteSelector {
  /**
   * Find the route serving this request, if the API has one.
   */
  select(
    routes: readonly SimHttpApiRoute[],
    request: SimHttpApiRouteRequest,
  ): SimHttpApiRouteSelection | undefined {
    let selected: SimHttpApiRouteSelection | undefined;

    for (const route of routes) {
      const pathParameters = route.key.match(request);

      if (pathParameters === undefined) {
        continue;
      }

      const candidate = new SimHttpApiRouteSelection({
        route,
        pathParameters,
      });

      if (selected === undefined || candidate.beats(selected)) {
        selected = candidate;
      }
    }

    return selected;
  }
}
