import { SimHttpApiRouteKeyParser } from "../../api/route/key/sim-http-api-route-key-parser.js";
import { SimHttpApiRoute } from "../../api/route/sim-http-api-route.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiAccess } from "../sim-http-api-access.js";
import type {
  SimCreateRouteCommand,
  SimCreateRouteCommandOutput,
  SimGetRoutesCommand,
  SimGetRoutesCommandOutput,
} from "./route.command.js";
import { SimHttpApiRouteAuthorizationInput } from "./sim-http-api-route-authorization.js";
import { SimHttpApiRouteTarget } from "./sim-http-api-route-target.js";

const routesPath = "/routes";

const acceptedCreateRouteOptions = [
  "ApiId",
  "RouteKey",
  "Target",
  "AuthorizationType",
  "AuthorizerId",
  "AuthorizationScopes",
];

/**
 * The authorization types a route may ask for.
 *
 * `AWS_IAM` and `CUSTOM` are refused rather than created open: a route asking
 * for either would admit anyone here and refuse them on AWS.
 */
const simulatedAuthorizationTypes = ["NONE", "JWT"];

interface SimHttpApiRouteCommandsProperties {
  readonly access: SimHttpApiAccess;
}

/**
 * The commands addressing the routes of an API.
 */
export class SimHttpApiRouteCommands {
  private readonly access: SimHttpApiAccess;
  private readonly routeTarget = new SimHttpApiRouteTarget();
  private readonly routeKeyParser = new SimHttpApiRouteKeyParser();

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
    // Parsed before the API is looked up, because a malformed route key is a
    // bad request whether or not the API it names exists.
    const routeKey = this.routeKeyParser.parse(
      unsimulated.require("RouteKey", input.RouteKey),
    );
    unsimulated.refuseUnlessOneOf(
      "AuthorizationType",
      input.AuthorizationType,
      simulatedAuthorizationTypes,
      "IAM and Lambda route authorization are not simulated",
    );
    const target = unsimulated.require("Target", input.Target);

    const httpApi = this.access.api({
      method: "POST",
      apiId,
      childPath: routesPath,
      caller: options?.caller,
    });
    this.routeTarget.requireUnusedRouteKey(httpApi, routeKey);
    // Read before the target is resolved, so a route asking for an authorizer
    // the API does not have is told that rather than told about its target.
    const authorization = new SimHttpApiRouteAuthorizationInput(input).read(
      httpApi,
    );

    const route = new SimHttpApiRoute({
      routeId: httpApi.routes.allocateId(),
      key: routeKey,
      integrationId: this.routeTarget.integrationId(httpApi, target),
      ...authorization,
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
