import type { SimPayload2Endpoint } from "../../../serve/payload-2/sim-payload-2-endpoint.js";
import type { SimHttpApiMatch } from "../api/sim-http-api-match.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

/**
 * Describe an API and the route that matched as the endpoint a payload format
 * 2.0 event names.
 *
 * There are no path parameters here, because the only simulated route key is
 * the catch-all `$default`, which captures nothing. Stage variables come from
 * the stage that served the request.
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
    stageVariables: match.stage.stageVariables,
  };
}
