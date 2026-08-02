import {
  makeSimHttpApiRouteId,
  type SimHttpApiRoute,
  type SimHttpApiRouteId,
} from "./sim-http-api-route.js";

/**
 * The routes of one API.
 *
 * Routes are keyed by route key signature rather than by id, because the route
 * key is what makes a route unique on real AWS: an API cannot have two routes
 * for the same method and path, and the id is only how a route is addressed
 * afterwards. The signature rather than the text, because a parameter name is
 * not part of a route's identity, so `GET /pets/{id}` and `GET /pets/{petId}`
 * are the same route. The ids in use are tracked alongside, so allocating one
 * can avoid them.
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
    this.routes.set(route.key.signature, route);
    this.routeIds.add(route.routeId);
  }

  /**
   * Find the route holding a route key signature, which is what tells whether
   * the API is already routing a route key.
   */
  findBySignature(signature: string): SimHttpApiRoute | undefined {
    return this.routes.get(signature);
  }

  /**
   * List every route of this API, in the order they were created.
   */
  list(): SimHttpApiRoute[] {
    return this.routes.values().toArray();
  }
}
