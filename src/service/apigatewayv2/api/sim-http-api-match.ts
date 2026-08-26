import type { SimHttpApiIntegrationStore } from "./integration/sim-http-api-integration-store.js";
import type { SimHttpApiIntegration } from "./integration/sim-http-api-integration.js";
import type { SimHttpApiPathParameters } from "./route/path/sim-http-api-path-parameters.js";
import type { SimHttpApiRouteStore } from "./route/sim-http-api-route-store.js";
import { SimHttpApiRouteRequest } from "./route/sim-http-api-route-request.js";
import { SimHttpApiRouteSelector } from "./route/sim-http-api-route-selector.js";
import type { SimHttpApiRoute } from "./route/sim-http-api-route.js";
import type { SimHttpApiStageStore } from "./stage/sim-http-api-stage-store.js";
import { SimHttpApiStageSelector } from "./stage/sim-http-api-stage-selector.js";
import type { SimHttpApiStage } from "./stage/sim-http-api-stage.js";
import type { SimHttpApiRequest } from "./sim-http-api-request.js";

/**
 * What an API found for one request: the stage serving it, the route that
 * matched it, the integration behind that route, and whatever the route
 * captured from the path.
 */
export interface SimHttpApiMatch {
  readonly route: SimHttpApiRoute;
  readonly integration: SimHttpApiIntegration;
  readonly stage: SimHttpApiStage;
  readonly pathParameters: SimHttpApiPathParameters;
  /**
   * The request path left for the routes, with the leading slash and whatever
   * came before them taken off: `/dev/pets/6` served from stage `dev` is
   * `pets/6`, and a request to the root is the empty string. On a custom
   * domain it is the base path of the API mapping that comes off instead.
   *
   * This is the form an `execute-api` ARN names a request by, which is what
   * an `AWS_IAM` route is authorized against.
   */
  readonly pathAfterStage: string;
}

/**
 * One request to a stage that has already been picked, and the path segments
 * left for that stage's routes to compete for.
 */
export interface SimHttpApiStageRequest {
  readonly stage: SimHttpApiStage;
  readonly method: string;
  readonly segments: readonly string[];
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
 * Finds what should handle one request to an API.
 *
 * The stage goes first, because a named stage is a path segment the routes
 * know nothing about: `/dev/pets/6` served from stage `dev` is the route path
 * `/pets/6`. The routes then compete for what is left.
 *
 * A request reaching an API with no stage for it, or no route for it, matches
 * nothing, which is a 404 on real AWS.
 */
export class SimHttpApiMatcher {
  private readonly stageSelector = new SimHttpApiStageSelector();
  private readonly routeSelector = new SimHttpApiRouteSelector();

  /**
   * Find what serves one request to an API.
   */
  match(
    stores: SimHttpApiStores,
    request: SimHttpApiRequest,
  ): SimHttpApiMatch | undefined {
    const stage = this.stageSelector.select(stores.stages, request.segments);

    if (stage === undefined) {
      return undefined;
    }

    return this.matchInStage(stores, {
      stage: stage.stage,
      method: request.method,
      segments: stage.segments,
    });
  }

  /**
   * Find what serves one request to a stage that has already been decided.
   *
   * A request reaching an API through a custom domain arrives this way: the
   * API mapping names the stage, and the base path rather than a stage name is
   * what has been taken off the front of the path. Route selection is the same
   * either way, which is why it is here rather than repeated.
   */
  matchInStage(
    stores: SimHttpApiStores,
    request: SimHttpApiStageRequest,
  ): SimHttpApiMatch | undefined {
    const selected = this.routeSelector.select(
      stores.routes.list(),
      new SimHttpApiRouteRequest({
        method: request.method,
        segments: request.segments,
      }),
    );

    if (selected === undefined) {
      return undefined;
    }

    const integration = stores.integrations.find(selected.route.integrationId);

    /* v8 ignore if -- a route cannot name an integration the API never had */
    if (integration === undefined) {
      return undefined;
    }

    return {
      route: selected.route,
      integration,
      stage: request.stage,
      pathParameters: selected.pathParameters,
      pathAfterStage: request.segments.join("/"),
    };
  }
}
