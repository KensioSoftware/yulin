import type { SimRestJsonInput } from "../../../../serve/http/api/rest-json/sim-rest-json-input.js";
import type { SimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";

/**
 * The Function URL configuration operations this endpoint serves.
 *
 * These live under a later API version than the function operations do, which
 * is how real Lambda dates the addition rather than anything a caller decides.
 * A configuration is reached at `/url` and the listing at `/urls`, so the two
 * are told apart by the last segment of the path.
 */
export const simLambdaUrlApiRoutes: readonly SimRestJsonRoute[] = [
  {
    method: "POST",
    path: "/2021-10-31/functions/{FunctionName}/url",
    commandName: "CreateFunctionUrlConfigCommand",
    status: 201,
    input: urlConfigInput,
  },
  {
    method: "GET",
    path: "/2021-10-31/functions/{FunctionName}/url",
    commandName: "GetFunctionUrlConfigCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "PUT",
    path: "/2021-10-31/functions/{FunctionName}/url",
    commandName: "UpdateFunctionUrlConfigCommand",
    input: urlConfigInput,
  },
  {
    method: "DELETE",
    path: "/2021-10-31/functions/{FunctionName}/url",
    commandName: "DeleteFunctionUrlConfigCommand",
    status: 204,
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "GET",
    path: "/2021-10-31/functions/{FunctionName}/urls",
    commandName: "ListFunctionUrlConfigsCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
];

/**
 * Read a configuration write, which names its function in the path and states
 * the configuration itself in the body.
 */
function urlConfigInput(input: SimRestJsonInput): Record<string, unknown> {
  return { ...input.json(), FunctionName: input.label("FunctionName") };
}
