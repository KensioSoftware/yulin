import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimHttpApiIntegrationId } from "../integration/sim-http-api-integration.js";
import type { SimHttpApiRouteKey } from "./key/sim-http-api-route-key.js";

/**
 * The id API Gateway allocates for one route.
 */
export type SimHttpApiRouteId = Brand<string, "SimHttpApiRouteId">;

/**
 * The only authorization type simulated: none, so anyone may call the route.
 */
export type SimHttpApiAuthorizationType = "NONE";

/**
 * Allocate a route id, in the same opaque shape as an integration id.
 */
export function makeSimHttpApiRouteId(): SimHttpApiRouteId {
  return faker.helpers.fromRegExp(/[a-z0-9]{8}/) as SimHttpApiRouteId;
}

interface SimHttpApiRouteProperties {
  readonly routeId: SimHttpApiRouteId;
  readonly key: SimHttpApiRouteKey;
  readonly integrationId: SimHttpApiIntegrationId;
  readonly authorizationType: SimHttpApiAuthorizationType;
}

/**
 * Minimal structural route view, as the Create and Get commands return.
 */
export interface SimHttpApiRouteView {
  RouteId: string;
  RouteKey: string;
  Target: string;
  AuthorizationType: SimHttpApiAuthorizationType;
}

/**
 * A simulated HTTP API route: which requests reach which integration.
 */
export class SimHttpApiRoute {
  public readonly routeId: SimHttpApiRouteId;
  public readonly key: SimHttpApiRouteKey;
  public readonly integrationId: SimHttpApiIntegrationId;
  public readonly authorizationType: SimHttpApiAuthorizationType;

  constructor(properties: SimHttpApiRouteProperties) {
    this.routeId = properties.routeId;
    this.key = properties.key;
    this.integrationId = properties.integrationId;
    this.authorizationType = properties.authorizationType;
  }

  /**
   * The route key as it was written, which is what the API reports back and
   * what reaches the handler as `event.routeKey`.
   */
  get routeKey(): string {
    return this.key.text;
  }

  /**
   * The route's target, in the `integrations/<id>` form the API takes it in
   * and hands it back.
   */
  get target(): string {
    return `integrations/${this.integrationId}`;
  }

  /**
   * Get the AWS-like view of this route.
   */
  view(): SimHttpApiRouteView {
    return {
      RouteId: this.routeId,
      RouteKey: this.routeKey,
      Target: this.target,
      AuthorizationType: this.authorizationType,
    };
  }
}
