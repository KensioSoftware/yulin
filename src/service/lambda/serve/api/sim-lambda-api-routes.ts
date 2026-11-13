import type { SimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";
import { simLambdaEventSourceApiRoutes } from "./sim-lambda-api-event-source-routes.js";
import { simLambdaFunctionApiRoutes } from "./sim-lambda-api-function-routes.js";
import { simLambdaPermissionApiRoutes } from "./sim-lambda-api-permission-routes.js";
import { simLambdaTagApiRoutes } from "./sim-lambda-api-tag-routes.js";
import { simLambdaUrlApiRoutes } from "./sim-lambda-api-url-routes.js";
import { simLambdaVersionApiRoutes } from "./sim-lambda-api-version-routes.js";

/**
 * The Lambda operations reachable through the served AWS API endpoint, which
 * are thirty-five of the ones simulated Lambda implements.
 *
 * No two of these share a method and a path, so the order they are listed in
 * decides nothing. A path that is not one of these is refused rather than
 * matched against the nearest of them.
 */
export const simLambdaApiRoutes: readonly SimRestJsonRoute[] = [
  ...simLambdaFunctionApiRoutes,
  ...simLambdaUrlApiRoutes,
  ...simLambdaPermissionApiRoutes,
  ...simLambdaEventSourceApiRoutes,
  ...simLambdaTagApiRoutes,
  ...simLambdaVersionApiRoutes,
];
