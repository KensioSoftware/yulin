import { SimHttpApiPathParameters } from "../path/sim-http-api-path-parameters.js";
import {
  defaultRouteTier,
  SimHttpApiRouteRank,
} from "../sim-http-api-route-rank.js";
import { exactMethodRank } from "./sim-http-api-route-method.js";
import type { SimHttpApiRouteKey } from "./sim-http-api-route-key.js";

/**
 * The catch-all route key, which serves any method and path the API has no
 * more specific route for.
 */
export const simHttpApiDefaultRouteKey = "$default";

/**
 * The `$default` route.
 *
 * It matches everything and captures nothing, and it loses to every other
 * matching route, which is the tier AWS documents it in.
 */
export class SimHttpApiDefaultRouteKey implements SimHttpApiRouteKey {
  public readonly text = simHttpApiDefaultRouteKey;
  public readonly signature = simHttpApiDefaultRouteKey;
  public readonly rank = new SimHttpApiRouteRank({
    tier: defaultRouteTier,
    methodRank: exactMethodRank,
    segmentRanks: [],
  });

  /**
   * Match any request, capturing nothing.
   *
   * The empty capture is what keeps `pathParameters` out of the event for a
   * `$default` match, which is what real API Gateway does with it. That is
   * observed rather than documented.
   */
  match(): SimHttpApiPathParameters {
    return new SimHttpApiPathParameters();
  }

  /**
   * Name this route in an `execute-api` ARN.
   *
   * The catch-all has no method and no path of its own, and both collapse into
   * the single literal `$default`, so the ARN ends `<apiId>/<stage>/$default`.
   * AWS gives that form as a CLI example for granting a `$default` route.
   */
  methodAndPath(): string {
    return simHttpApiDefaultRouteKey;
  }
}
