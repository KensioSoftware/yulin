import type { SimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";

/**
 * The tagging operations this endpoint serves.
 *
 * Real Lambda dates these under their own API version and addresses the
 * function by its whole ARN in the path, rather than by name as the function
 * operations do.
 */
export const simLambdaTagApiRoutes: readonly SimRestJsonRoute[] = [
  {
    method: "POST",
    path: "/2017-03-31/tags/{Resource}",
    commandName: "TagResourceCommand",
    status: 204,
    input: (input) => ({ ...input.json(), Resource: input.label("Resource") }),
  },
  {
    method: "DELETE",
    path: "/2017-03-31/tags/{Resource}",
    commandName: "UntagResourceCommand",
    status: 204,
    input: (input) => ({
      Resource: input.label("Resource"),
      TagKeys: input.queryAll("tagKeys"),
    }),
  },
  {
    method: "GET",
    path: "/2017-03-31/tags/{Resource}",
    commandName: "ListTagsCommand",
    input: (input) => ({ Resource: input.label("Resource") }),
  },
];
