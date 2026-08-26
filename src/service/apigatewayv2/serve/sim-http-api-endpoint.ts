import type { SimPayload2Endpoint } from "../../../serve/payload-2/sim-payload-2-endpoint.js";
import type { SimHttpApiServing } from "./sim-http-api-serving.js";

/**
 * Describe an API and the route that matched as the endpoint a payload format
 * 2.0 event names.
 *
 * The hostname is the one the request arrived on rather than the one API
 * Gateway generated, so a handler behind a custom domain reads the domain its
 * client asked for.
 *
 * The reported path is the one the resolver settled. An API mapping's base
 * path has already come off it, which is what AWS documents `rawPath` as
 * doing.
 *
 * The path parameters come from the matched route and the stage variables from
 * the stage that served the request. Either may be empty, and the event
 * builder leaves an empty one out of the event, which is what real API Gateway
 * does with them.
 */
export function simHttpApiEndpoint(
  serving: SimHttpApiServing,
): SimPayload2Endpoint {
  const { api, match, domainName } = serving;

  return {
    apiId: api.apiId,
    domainName,
    // The first label, which is the API id for a generated endpoint and the
    // subdomain for a custom one. `split` with a limit always yields it, so
    // there is nothing to fall back to.
    domainPrefix: domainName.split(".", 1).join(""),
    requestPath: serving.rawPath,
    routeKey: match.route.routeKey,
    stage: match.stage.stageName,
    pathParameters: match.pathParameters.toRecord(),
    stageVariables: match.stage.stageVariables,
  };
}
