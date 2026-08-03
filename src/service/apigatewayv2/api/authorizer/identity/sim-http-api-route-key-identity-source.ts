import type {
  SimHttpApiIdentityInput,
  SimHttpApiIdentitySource,
} from "./sim-http-api-identity-source.js";

/**
 * The one `$context` identity source simulated.
 */
export const simHttpApiRouteKeyIdentityExpression = "$context.routeKey";

/**
 * An identity source naming the route the request matched.
 *
 * This is the source AWS documents for caching a Lambda authorizer's decision
 * per route. Every other identity source reads something the client sent, and
 * a decision keyed only on those covers every route of the API using that
 * authorizer, which is what AWS warns about. Adding this one puts the route in
 * the key.
 *
 * It never refuses a request the way a missing header does: every matched
 * request has a route key, so this source always supplies a value.
 */
export class SimHttpApiRouteKeyIdentitySource implements SimHttpApiIdentitySource {
  public readonly expression = simHttpApiRouteKeyIdentityExpression;

  /**
   * The route key of the route that matched.
   */
  value(input: SimHttpApiIdentityInput): string {
    return input.routeKey;
  }
}
