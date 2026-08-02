import {
  simHttpApiDefaultRouteKey,
  SimHttpApiRoute,
} from "../../api/route/sim-http-api-route.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiAccess } from "../sim-http-api-access.js";
import type {
  SimCreateRouteCommand,
  SimCreateRouteCommandOutput,
  SimGetRoutesCommand,
  SimGetRoutesCommandOutput,
} from "./route.command.js";
import { SimHttpApiRouteTarget } from "./sim-http-api-route-target.js";

const routesPath = "/routes";

const acceptedCreateRouteOptions = [
  "ApiId",
  "RouteKey",
  "Target",
  "AuthorizationType",
];

interface SimHttpApiRouteCommandsProperties {
  readonly access: SimHttpApiAccess;
}

/**
 * The commands addressing the routes of an API.
 */
export class SimHttpApiRouteCommands {
  private readonly access: SimHttpApiAccess;
  private readonly routeTarget = new SimHttpApiRouteTarget();

  constructor(properties: SimHttpApiRouteCommandsProperties) {
    this.access = properties.access;
  }

  /**
   * Handle a CreateRoute command.
   */
  createRoute(
    command: SimCreateRouteCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimCreateRouteCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("CreateRoute");
    unsimulated.refuseUnaccepted(input, acceptedCreateRouteOptions);
    const apiId = unsimulated.require("ApiId", input.ApiId);
    unsimulated.require("RouteKey", input.RouteKey);
    unsimulated.refuseUnless(
      "RouteKey",
      input.RouteKey,
      simHttpApiDefaultRouteKey,
      "matching a route by method and path is not simulated, so every " +
        "request reaches the catch-all route",
    );
    unsimulated.refuseUnless(
      "AuthorizationType",
      input.AuthorizationType,
      "NONE",
      "route authorizers are not simulated",
    );
    const target = unsimulated.require("Target", input.Target);

    const httpApi = this.access.api({
      method: "POST",
      apiId,
      childPath: routesPath,
      caller: options?.caller,
    });
    this.routeTarget.requireUnusedRouteKey(httpApi, simHttpApiDefaultRouteKey);

    const route = new SimHttpApiRoute({
      routeId: httpApi.routes.allocateId(),
      routeKey: simHttpApiDefaultRouteKey,
      integrationId: this.routeTarget.integrationId(httpApi, target),
      authorizationType: "NONE",
    });
    httpApi.routes.add(route);

    return { ...route.view(), $metadata: {} };
  }

  /**
   * Handle a GetRoutes command.
   */
  getRoutes(
    command: SimGetRoutesCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetRoutesCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetRoutes");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, ["ApiId"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);

    const httpApi = this.access.api({
      method: "GET",
      apiId,
      childPath: routesPath,
      caller: options?.caller,
    });

    return {
      Items: httpApi.routes.list().map((route) => route.view()),
      $metadata: {},
    };
  }
}
