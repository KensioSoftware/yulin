import type { SimHttpApiIntegrationId } from "../../api/integration/sim-http-api-integration.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2Conflict,
  SimApiGatewayV2NotFound,
} from "../../error/sim-api-gateway-v2.error.js";

const integrationTarget = /^integrations\/(?<integrationId>[a-z0-9]+)$/;

/**
 * The rules a route has to satisfy before an API will hold it.
 */
export class SimHttpApiRouteTarget {
  /**
   * Read the integration a route target names.
   *
   * An integration is the only thing a simulated route can point at, so a
   * target of any other shape is refused rather than stored as a route that
   * would match requests and then have nothing to hand them to.
   */
  integrationId(httpApi: SimHttpApi, target: string): SimHttpApiIntegrationId {
    const integrationId =
      integrationTarget.exec(target)?.groups?.["integrationId"];

    if (integrationId === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `Target '${target}' is not a simulated route target: a route is ` +
          `simulated only for an integration, named as ` +
          `integrations/<integration-id>`,
      );
    }

    const integration = httpApi.integrations.find(integrationId);

    if (integration === undefined) {
      throw new SimApiGatewayV2NotFound(
        `API ${httpApi.apiId} has no integration with id ${integrationId}`,
      );
    }

    return integration.integrationId;
  }

  /**
   * Ensure the API is not already routing this route key, which real API
   * Gateway answers with a conflict.
   */
  requireUnusedRouteKey(httpApi: SimHttpApi, routeKey: string): void {
    if (httpApi.routes.findByKey(routeKey) !== undefined) {
      throw new SimApiGatewayV2Conflict(
        `API ${httpApi.apiId} already has a route for ${routeKey}`,
      );
    }
  }
}
