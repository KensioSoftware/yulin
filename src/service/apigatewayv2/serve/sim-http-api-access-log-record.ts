import { simAwsProxiedSourceIp } from "../../../serve/http/sim-aws-proxied-connection.js";
import type { SimHttpApiAccessLogRequest } from "../api/stage/access-log/sim-http-api-access-log-request.js";
import type { SimHttpApiAuthorization } from "../api/authorizer/sim-http-api-authorization.js";
import type { SimHttpApiServing } from "./sim-http-api-serving.js";
import type { SimHttpApiIntegrationOutcome } from "./sim-http-api-integration-outcome.js";

/**
 * The `$context.error.message` an endpoint's own refusal carries.
 *
 * These are the bodies `SimApiGatewayV2ErrorResponse` answers with, keyed by
 * the status they answer with. A response an integration produced has no entry
 * here, and leaves the variable empty as real API Gateway does.
 */
const refusalMessages = new Map<number, string>([
  [401, "Unauthorized"],
  [403, "Forbidden"],
  [429, "Too Many Requests"],
  [500, "Internal Server Error"],
]);

interface SimHttpApiAccessLogRecordInput {
  readonly serving: SimHttpApiServing;
  readonly requestId: string;
  readonly request: Request;
  readonly response: Response;
  /** Simulated milliseconds the whole request took. */
  readonly responseLatency: number;
  /** How long the response body is, measured from the response itself. */
  readonly responseLength: number;
  /** The simulated instant the request arrived. */
  readonly at: Date;
  /** Absent for a request refused before the route's authorizer ran. */
  readonly authorization?: SimHttpApiAuthorization | undefined;
  /** Absent for a request no integration was invoked for. */
  readonly integration?: SimHttpApiIntegrationOutcome | undefined;
}

/**
 * Describe one served request as its stage's access log records it.
 *
 * Every path through the endpoint arrives here, including the ones that
 * refused the request. A throttled request has no authorization and no
 * integration, and an authorizer that said no has an authorization and no
 * integration. What each one knows is what its line carries, and the rest of
 * the format's variables render as dashes.
 */
export function simHttpApiAccessLogRecord(
  input: SimHttpApiAccessLogRecordInput,
): SimHttpApiAccessLogRequest {
  const { serving, request, response, authorization, integration } = input;
  const { api, match, domainName } = serving;
  const admitted = authorization?.admitted === true ? authorization : undefined;

  return {
    requestId: input.requestId,
    at: input.at,
    accountId: api.accountRegionScope.accountId,
    apiId: api.apiId,
    domainName,
    domainPrefix: domainName.split(".", 1).join(""),
    stage: match.stage.stageName,
    routeKey: match.route.routeKey,
    method: request.method,
    path: serving.rawPath,
    protocol: "HTTP/1.1",
    sourceIp: simAwsProxiedSourceIp,
    userAgent: request.headers.get("user-agent") ?? "",
    status: response.status,
    responseLength: input.responseLength,
    responseLatency: input.responseLatency,
    ...(refusalMessage(response, integration) !== undefined && {
      errorMessage: refusalMessage(response, integration),
    }),
    ...(authorization?.admitted === false &&
      authorization.errorDescription !== undefined && {
        authorizerError: authorization.errorDescription,
      }),
    ...integrationFields(integration),
    ...(admitted?.jwt !== undefined && { jwt: admitted.jwt }),
    ...(admitted?.lambda !== undefined && { lambda: admitted.lambda }),
    ...(serving.basePathMatched !== undefined && {
      basePathMatched: serving.basePathMatched,
    }),
  };
}

/**
 * What the integration contributed, with the members it has no value for left
 * out so that they render as dashes.
 *
 * A request no integration ran for contributes nothing at all, which is what a
 * throttled or refused request does.
 */
function integrationFields(
  integration: SimHttpApiIntegrationOutcome | undefined,
): Partial<SimHttpApiAccessLogRequest> {
  if (integration === undefined) {
    return {};
  }

  const {
    integrationStatus,
    lambdaInvokeStatus,
    integrationErrorMessage,
    integrationLatency,
  } = integration;

  return {
    ...(integrationStatus !== undefined && { integrationStatus }),
    ...(lambdaInvokeStatus !== undefined && { lambdaInvokeStatus }),
    ...(integrationErrorMessage !== undefined && { integrationErrorMessage }),
    ...(integrationLatency !== undefined && { integrationLatency }),
  };
}

/**
 * The message the endpoint answered with, where the endpoint answered rather
 * than the integration.
 */
function refusalMessage(
  response: Response,
  integration: SimHttpApiIntegrationOutcome | undefined,
): string | undefined {
  if (integration?.integrationStatus !== undefined) {
    return undefined;
  }

  return refusalMessages.get(response.status);
}
