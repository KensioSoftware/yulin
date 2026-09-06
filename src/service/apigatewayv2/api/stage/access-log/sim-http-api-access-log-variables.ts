import { simProxyEventTime } from "../../../../../serve/proxy/sim-proxy-event-time.js";
import type { SimHttpApiAccessLogRequest } from "./sim-http-api-access-log-request.js";

function numberOrUndefined(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

/**
 * The `$context` variables one request answers, keyed by the name that follows
 * `$context.`.
 *
 * A variable this simulation has no value for is left out of the map. The
 * substitution writes `-` for it, which is what real API Gateway writes for a
 * variable with no value. That rendering is what the service was observed to
 * do rather than something AWS publishes.
 *
 * `$context.extendedRequestId` and `$context.integration.latency` are
 * documented as equivalents of the flat names, and carry the same values here.
 * `$context.integrationStatus` is the status Lambda answered the invocation
 * with, and `$context.integration.status` the one the handler's own code
 * returned, which is the distinction AWS draws between the two.
 */
export function simHttpApiAccessLogVariables(
  request: SimHttpApiAccessLogRequest,
): ReadonlyMap<string, string> {
  const variables = new Map<string, string | undefined>([
    ["accountId", request.accountId],
    ["apiId", request.apiId],
    ["domainName", request.domainName],
    ["domainPrefix", request.domainPrefix],
    ["stage", request.stage],
    ["routeKey", request.routeKey],
    ["httpMethod", request.method],
    ["path", request.path],
    ["protocol", request.protocol],
    ["requestId", request.requestId],
    ["extendedRequestId", request.requestId],
    ["requestTime", simProxyEventTime(request.at)],
    ["requestTimeEpoch", String(request.at.getTime())],
    ["status", String(request.status)],
    ["responseLength", String(request.responseLength)],
    ["responseLatency", String(request.responseLatency)],
    ["identity.sourceIp", request.sourceIp],
    ["identity.userAgent", request.userAgent],
    ["integrationStatus", numberOrUndefined(request.lambdaInvokeStatus)],
    [
      "integration.integrationStatus",
      numberOrUndefined(request.lambdaInvokeStatus),
    ],
    ["integrationLatency", numberOrUndefined(request.integrationLatency)],
    ["integration.latency", numberOrUndefined(request.integrationLatency)],
    ["integration.status", numberOrUndefined(request.integrationStatus)],
    ["integrationErrorMessage", request.integrationErrorMessage],
    ["integration.error", request.integrationErrorMessage],
    ["authorizer.error", request.authorizerError],
    ["error.message", request.errorMessage],
    ["customDomain.basePathMatched", request.basePathMatched],
  ]);

  addQuotedMessage(variables, request);
  addAuthorizerProperties(variables, request);

  return new Map(
    [...variables].flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as const],
    ),
  );
}

/**
 * `$context.error.messageString` is the quoted form of the message, which is
 * what a JSON format string uses to keep its own quoting intact.
 */
function addQuotedMessage(
  variables: Map<string, string | undefined>,
  request: SimHttpApiAccessLogRequest,
): void {
  if (request.errorMessage !== undefined) {
    variables.set("error.messageString", `"${request.errorMessage}"`);
  }
}

/**
 * The claims a `JWT` route's authorizer accepted and the context map a
 * `CUSTOM` route's authorizer returned.
 *
 * Both are reached by naming the property. `$context.authorizer.claims` and
 * `$context.authorizer` name no property, and AWS documents the first of those
 * as returning null, so neither is given a value here.
 */
function addAuthorizerProperties(
  variables: Map<string, string | undefined>,
  request: SimHttpApiAccessLogRequest,
): void {
  const claims = Object.entries(request.jwt?.claims ?? {});
  const authorizerContext = Object.entries(request.lambda ?? {});

  for (const [claim, value] of claims) {
    variables.set(`authorizer.claims.${claim}`, value);
  }

  for (const [key, value] of authorizerContext) {
    if (value !== null && typeof value !== "object") {
      variables.set(`authorizer.${key}`, String(value));
    }
  }
}
