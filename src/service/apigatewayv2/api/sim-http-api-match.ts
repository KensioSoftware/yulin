import type { SimHttpApiIntegrationStore } from "./integration/sim-http-api-integration-store.js";
import type { SimHttpApiIntegration } from "./integration/sim-http-api-integration.js";
import type { SimHttpApiRouteStore } from "./route/sim-http-api-route-store.js";
import {
  simHttpApiDefaultRouteKey,
  type SimHttpApiRoute,
} from "./route/sim-http-api-route.js";
import type { SimHttpApiStageStore } from "./stage/sim-http-api-stage-store.js";
import {
  simHttpApiDefaultStageName,
  type SimHttpApiStage,
} from "./stage/sim-http-api-stage.js";

/**
 * What an API found for one request: the route that matched it, the
 * integration behind that route, and the stage serving it.
 */
export interface SimHttpApiMatch {
  readonly route: SimHttpApiRoute;
  readonly integration: SimHttpApiIntegration;
  readonly stage: SimHttpApiStage;
}

/**
 * The stores a match is looked for in, which one simulated API satisfies.
 */
interface SimHttpApiStores {
  readonly integrations: SimHttpApiIntegrationStore;
  readonly routes: SimHttpApiRouteStore;
  readonly stages: SimHttpApiStageStore;
}

/**
 * Find what should handle one request to an API.
 *
 * Only the `$default` route is simulated, so every request an API is asked
 * about matches it if it exists, whatever the method and path. A request
 * reaching an API with no route, or no stage to serve it from, matches
 * nothing, which is a 404 on real AWS.
 */
export function simHttpApiMatch(
  stores: SimHttpApiStores,
): SimHttpApiMatch | undefined {
  const route = stores.routes.findByKey(simHttpApiDefaultRouteKey);
  const stage = stores.stages.find(simHttpApiDefaultStageName);

  if (route === undefined || stage === undefined) {
    return undefined;
  }

  const integration = stores.integrations.find(route.integrationId);

  /* v8 ignore if -- a route cannot name an integration the API never had */
  if (integration === undefined) {
    return undefined;
  }

  return { route, integration, stage };
}
