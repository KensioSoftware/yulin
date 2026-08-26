import type { SimPayload2Endpoint } from "../../../serve/payload-2/sim-payload-2-endpoint.js";
import type { SimHttpApiMatch } from "../api/sim-http-api-match.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

/**
 * Describe an API and the route that matched as the endpoint a payload format
 * 2.0 event names.
 *
 * The hostname is the one the request arrived on rather than the one API
 * Gateway generated, so a handler behind a custom domain reads the domain its
 * client asked for. The prefix is that hostname's first label, which is the
 * API id for a generated endpoint and the subdomain for a custom one.
 *
 * The path parameters come from the matched route and the stage variables from
 * the stage that served the request. Either may be empty, and the event
 * builder leaves an empty one out of the event, which is what real API Gateway
 * does with them.
 */
export function simHttpApiEndpoint(
  api: SimHttpApi,
  match: SimHttpApiMatch,
  domainName: string,
): SimPayload2Endpoint {
  return {
    apiId: api.apiId,
    domainName,
    domainPrefix: domainName.split(".", 1)[0] ?? domainName,
    routeKey: match.route.routeKey,
    stage: match.stage.stageName,
    pathParameters: match.pathParameters.toRecord(),
    stageVariables: match.stage.stageVariables,
  };
}
