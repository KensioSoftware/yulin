import type { SimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";

/**
 * The resource policy operations this endpoint serves.
 *
 * A statement is added and read at the function's `/policy`, and removed at
 * that path with the statement id appended, so the removal is the one of the
 * three that reads a second label out of the path.
 */
export const simLambdaPermissionApiRoutes: readonly SimRestJsonRoute[] = [
  {
    method: "POST",
    path: "/2015-03-31/functions/{FunctionName}/policy",
    commandName: "AddPermissionCommand",
    status: 201,
    input: (input) => ({
      ...input.json(),
      FunctionName: input.label("FunctionName"),
    }),
  },
  {
    method: "GET",
    path: "/2015-03-31/functions/{FunctionName}/policy",
    commandName: "GetPolicyCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "DELETE",
    path: "/2015-03-31/functions/{FunctionName}/policy/{StatementId}",
    commandName: "RemovePermissionCommand",
    status: 204,
    input: (input) => ({
      FunctionName: input.label("FunctionName"),
      StatementId: input.label("StatementId"),
    }),
  },
];
