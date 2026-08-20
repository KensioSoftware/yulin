import type { SimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";
import {
  createFunctionInput,
  invokeInput,
  updateFunctionCodeInput,
  updateFunctionConfigurationInput,
} from "./sim-lambda-api-function-input.js";
import { simLambdaInvokeResponse } from "./sim-lambda-api-invoke-output.js";

/**
 * The function operations this endpoint serves.
 */
export const simLambdaFunctionApiRoutes: readonly SimRestJsonRoute[] = [
  {
    method: "POST",
    path: "/2015-03-31/functions",
    commandName: "CreateFunctionCommand",
    status: 201,
    input: createFunctionInput,
  },
  {
    method: "GET",
    path: "/2015-03-31/functions",
    commandName: "ListFunctionsCommand",
    input: (input) => ({ FunctionVersion: input.query("FunctionVersion") }),
  },
  {
    method: "GET",
    path: "/2015-03-31/functions/{FunctionName}",
    commandName: "GetFunctionCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "PUT",
    path: "/2015-03-31/functions/{FunctionName}/code",
    commandName: "UpdateFunctionCodeCommand",
    input: updateFunctionCodeInput,
  },
  {
    method: "PUT",
    path: "/2015-03-31/functions/{FunctionName}/configuration",
    commandName: "UpdateFunctionConfigurationCommand",
    input: updateFunctionConfigurationInput,
  },
  {
    method: "DELETE",
    path: "/2015-03-31/functions/{FunctionName}",
    commandName: "DeleteFunctionCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "POST",
    path: "/2015-03-31/functions/{FunctionName}/invocations",
    commandName: "InvokeCommand",
    input: invokeInput,
    output: simLambdaInvokeResponse,
  },
];
