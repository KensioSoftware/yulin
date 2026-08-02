import {
  makeSimHttpApiRouteId,
  type SimHttpApiRoute,
  type SimHttpApiRouteId,
} from "./sim-http-api-route.js";

/**
 * The routes of one API.
 *
 * Routes are keyed by route key rather than by id, because the route key is
 * what makes a route unique on real AWS: an API cannot have two routes for the
 * same method and path, and the id is only how a route is addressed
 * afterwards. The ids in use are tracked alongside, so allocating one can
 * avoid them.
 */
export class SimHttpApiRouteStore {
  private readonly routes = new Map<string, SimHttpApiRoute>();
  private readonly routeIds = new Set<SimHttpApiRouteId>();

  /**
   * Allocate a route id this API is not already using.
   */
  allocateId(): SimHttpApiRouteId {
    let routeId = makeSimHttpApiRouteId();

    while (this.routeIds.has(routeId)) {
      /* v8 ignore next -- does not happen in practice */
      routeId = makeSimHttpApiRouteId();
    }

    return routeId;
  }

  /**
   * Add a route to this API.
   */
  add(route: SimHttpApiRoute): void {
    this.routes.set(route.routeKey, route);
    this.routeIds.add(route.routeId);
  }

  /**
   * Find the route for a route key.
   */
  findByKey(routeKey: string): SimHttpApiRoute | undefined {
    return this.routes.get(routeKey);
  }

  /**
   * List every route of this API, in the order they were created.
   */
  list(): SimHttpApiRoute[] {
    return this.routes.values().toArray();
  }
}
