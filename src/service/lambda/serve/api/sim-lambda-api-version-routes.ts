import type { SimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";

/**
 * The version and alias operations this endpoint serves.
 *
 * Versions are published and listed at the function's `/versions`, and
 * aliases created and listed at its `/aliases`. One alias is addressed by its
 * name appended to that path.
 */
export const simLambdaVersionApiRoutes: readonly SimRestJsonRoute[] = [
  {
    method: "POST",
    path: "/2015-03-31/functions/{FunctionName}/versions",
    commandName: "PublishVersionCommand",
    status: 201,
    input: (input) => ({
      ...input.json(),
      FunctionName: input.label("FunctionName"),
    }),
  },
  {
    method: "GET",
    path: "/2015-03-31/functions/{FunctionName}/versions",
    commandName: "ListVersionsByFunctionCommand",
    input: (input) => ({
      FunctionName: input.label("FunctionName"),
      Marker: input.query("Marker"),
      MaxItems: input.queryNumber("MaxItems"),
    }),
  },
  {
    method: "POST",
    path: "/2015-03-31/functions/{FunctionName}/aliases",
    commandName: "CreateAliasCommand",
    status: 201,
    input: (input) => ({
      ...input.json(),
      FunctionName: input.label("FunctionName"),
    }),
  },
  {
    method: "GET",
    path: "/2015-03-31/functions/{FunctionName}/aliases",
    commandName: "ListAliasesCommand",
    input: (input) => ({
      FunctionName: input.label("FunctionName"),
      FunctionVersion: input.query("FunctionVersion"),
      Marker: input.query("Marker"),
      MaxItems: input.queryNumber("MaxItems"),
    }),
  },
  {
    method: "GET",
    path: "/2015-03-31/functions/{FunctionName}/aliases/{Name}",
    commandName: "GetAliasCommand",
    input: (input) => ({
      FunctionName: input.label("FunctionName"),
      Name: input.label("Name"),
    }),
  },
  {
    method: "PUT",
    path: "/2015-03-31/functions/{FunctionName}/aliases/{Name}",
    commandName: "UpdateAliasCommand",
    input: (input) => ({
      ...input.json(),
      FunctionName: input.label("FunctionName"),
      Name: input.label("Name"),
    }),
  },
  {
    method: "DELETE",
    path: "/2015-03-31/functions/{FunctionName}/aliases/{Name}",
    commandName: "DeleteAliasCommand",
    status: 204,
    input: (input) => ({
      FunctionName: input.label("FunctionName"),
      Name: input.label("Name"),
    }),
  },
];
