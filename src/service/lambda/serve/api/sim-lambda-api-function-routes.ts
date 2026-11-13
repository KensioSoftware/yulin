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
    input: (input) => ({
      FunctionVersion: input.query("FunctionVersion"),
      Marker: input.query("Marker"),
      MaxItems: input.queryNumber("MaxItems"),
    }),
  },
  {
    method: "GET",
    path: "/2015-03-31/functions/{FunctionName}/configuration",
    commandName: "GetFunctionConfigurationCommand",
    input: (input) => ({
      FunctionName: input.label("FunctionName"),
      Qualifier: input.query("Qualifier"),
    }),
  },
  {
    method: "GET",
    path: "/2015-03-31/functions/{FunctionName}",
    commandName: "GetFunctionCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "GET",
    path: "/2016-08-19/account-settings",
    commandName: "GetAccountSettingsCommand",
    input: () => ({}),
  },
  {
    method: "PUT",
    path: "/2017-10-31/functions/{FunctionName}/concurrency",
    commandName: "PutFunctionConcurrencyCommand",
    input: (input) => ({
      ...input.json(),
      FunctionName: input.label("FunctionName"),
    }),
  },
  {
    method: "GET",
    path: "/2019-09-30/functions/{FunctionName}/concurrency",
    commandName: "GetFunctionConcurrencyCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "PUT",
    path: "/2024-08-31/functions/{FunctionName}/recursion-config",
    commandName: "PutFunctionRecursionConfigCommand",
    input: (input) => ({
      ...input.json(),
      FunctionName: input.label("FunctionName"),
    }),
  },
  {
    method: "GET",
    path: "/2024-08-31/functions/{FunctionName}/recursion-config",
    commandName: "GetFunctionRecursionConfigCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "DELETE",
    path: "/2017-10-31/functions/{FunctionName}/concurrency",
    commandName: "DeleteFunctionConcurrencyCommand",
    status: 204,
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
