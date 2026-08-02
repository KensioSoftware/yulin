import type {
  SimHttpApiAuthorizationType,
  SimHttpApiRoute,
} from "./sim-http-api-route.js";

/**
 * Minimal structural route view, as the Create and Get commands return.
 *
 * The two authorization fields are absent on a route that authorizes nobody,
 * rather than reported as an empty id and an empty list.
 */
export interface SimHttpApiRouteView {
  RouteId: string;
  RouteKey: string;
  Target: string;
  AuthorizationType: SimHttpApiAuthorizationType;
  AuthorizerId?: string;
  AuthorizationScopes?: string[];
}

/**
 * Get the AWS-like view of one route.
 */
export function simHttpApiRouteView(
  route: SimHttpApiRoute,
): SimHttpApiRouteView {
  const view: SimHttpApiRouteView = {
    RouteId: route.routeId,
    RouteKey: route.routeKey,
    Target: route.target,
    AuthorizationType: route.authorizationType,
  };

  if (route.authorizerId !== undefined) {
    view.AuthorizerId = route.authorizerId;
  }

  if (!route.authorizationScopes.isEmpty) {
    view.AuthorizationScopes = [...route.authorizationScopes.values];
  }

  return view;
}
