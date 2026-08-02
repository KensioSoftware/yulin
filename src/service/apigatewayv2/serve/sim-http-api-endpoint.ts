import type { SimPayload2Endpoint } from "../../../serve/payload-2/sim-payload-2-endpoint.js";
import type { SimHttpApiMatch } from "../api/sim-http-api-match.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

/**
 * Describe an API and the route that matched as the endpoint a payload format
 * 2.0 event names.
 *
 * The path parameters come from the matched route and the stage variables from
 * the stage that served the request. Either may be empty, and the event
 * builder leaves an empty one out of the event, which is what real API Gateway
 * does with them.
 */
export function simHttpApiEndpoint(
  api: SimHttpApi,
  match: SimHttpApiMatch,
): SimPayload2Endpoint {
  return {
    apiId: api.apiId,
    domainName: api.hostname,
    domainPrefix: api.apiId,
    routeKey: match.route.routeKey,
    stage: match.stage.stageName,
    pathParameters: match.pathParameters.toRecord(),
    stageVariables: match.stage.stageVariables,
  };
}
