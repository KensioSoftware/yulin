import type { SimPayload1Endpoint } from "../../../serve/payload-1/sim-payload-1-endpoint.js";
import type { SimRestApiMatch } from "../api/match/sim-rest-api-match.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

/**
 * Describe a matched request as the endpoint identity the event builder reads.
 *
 * The resource fields name the tree node the path matched rather than the path
 * the client asked for, which is what lets a handler behind a `{proxy+}` tell
 * which template caught its request.
 */
export function simRestApiEndpoint(
  restApi: SimRestApi,
  match: SimRestApiMatch,
): SimPayload1Endpoint {
  return {
    apiId: restApi.apiId,
    accountId: restApi.accountRegionScope.accountId,
    domainName: restApi.hostname,
    stage: match.stage.stageName,
    resourceId: match.resource.resourceId,
    resourcePath: match.resource.path,
    httpMethod: match.method.httpMethod,
    pathParameters: match.pathParameters,
    stageVariables: match.stage.variables,
  };
}
