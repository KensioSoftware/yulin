import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimHttpApiAuthorizerId } from "../authorizer/sim-http-api-authorizer.js";
import type { SimHttpApiIntegrationId } from "../integration/sim-http-api-integration.js";
import type { SimHttpApiRouteKey } from "./key/sim-http-api-route-key.js";
import { SimHttpApiRouteScopes } from "./sim-http-api-route-scopes.js";
import {
  simHttpApiRouteView,
  type SimHttpApiRouteView,
} from "./sim-http-api-route-view.js";

/**
 * The id API Gateway allocates for one route.
 */
export type SimHttpApiRouteId = Brand<string, "SimHttpApiRouteId">;

/**
 * The authorization types simulated: none, so anyone may call the route, a JWT
 * the route's authorizer verifies, or a SigV4-signed caller IAM allows
 * `execute-api:Invoke` on the route being called.
 *
 * `CUSTOM`, which is a Lambda authorizer, is refused at creation rather than
 * created open.
 */
export type SimHttpApiAuthorizationType = "NONE" | "JWT" | "AWS_IAM";

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
  readonly authorizerId?: SimHttpApiAuthorizerId | undefined;
  readonly authorizationScopes?: SimHttpApiRouteScopes | undefined;
}

/**
 * A simulated HTTP API route: which requests reach which integration, and what
 * a caller has to present to get there.
 */
export class SimHttpApiRoute {
  public readonly routeId: SimHttpApiRouteId;
  public readonly key: SimHttpApiRouteKey;
  public readonly integrationId: SimHttpApiIntegrationId;
  public readonly authorizationType: SimHttpApiAuthorizationType;

  /**
   * The authorizer this route sends requests through, which only a `JWT` route
   * has. An `AWS_IAM` route takes no authorizer, since IAM itself is what
   * decides, and a `NONE` route authorizes nobody.
   */
  public readonly authorizerId: SimHttpApiAuthorizerId | undefined;

  public readonly authorizationScopes: SimHttpApiRouteScopes;

  constructor(properties: SimHttpApiRouteProperties) {
    this.routeId = properties.routeId;
    this.key = properties.key;
    this.integrationId = properties.integrationId;
    this.authorizationType = properties.authorizationType;
    this.authorizerId = properties.authorizerId;
    this.authorizationScopes =
      properties.authorizationScopes ?? new SimHttpApiRouteScopes();
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
    return simHttpApiRouteView(this);
  }
}
