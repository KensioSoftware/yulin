import { faker } from "@faker-js/faker";
import { DynamicFactory } from "@kensio/part-factory";

import { simAwsProxiedTraceId } from "../../../serve/http/sim-aws-proxied-connection.js";
import { simPayload2EventTime } from "../../../serve/payload-2/sim-payload-2-event-time.js";
import { simPayload2AnonymousAccountId } from "../../../serve/payload-2/sim-payload-2-iam-caller.js";
import {
  simPayload2ProxyHeaders,
  simPayload2QueryStringParameters,
} from "../../../serve/payload-2/sim-payload-2-request-parts.js";
import type { SimLambdaFunctionUrlEvent } from "../serve/event/sim-lambda-url-event.type.js";
import {
  type FunctionUrlEventRequest,
  functionUrlEventRequest,
} from "./lambda-function-url-event-request.js";

/**
 * The route key and stage a Function URL invocation always carries: there is
 * no route to match and no stage to deploy to, so real Lambda names both
 * `$default`.
 */
const functionUrlDefaultKey = "$default";

/**
 * Makes Lambda Function URL invocation events, so a test of a Function URL
 * handler can say what the request was rather than writing out the payload
 * format 2.0 event around it.
 *
 * The defaults describe an anonymous `GET /` to a `NONE` auth Function URL,
 * which is what a simulated Function URL delivers for such a request. Anything
 * a test cares about is passed as overrides, and a named variation composes as
 * any other `part-factory` factory does:
 *
 * ```typescript
 * const formPostFactory = new VariantFactory(lambdaFunctionUrlEventFactory, {
 *   headers: { "content-type": "application/x-www-form-urlencoded" },
 *   requestContext: { http: { method: "POST" } },
 * });
 * ```
 *
 * A real event says several things twice, and the defaults are computed from
 * the overrides so that supplying either copy sets both:
 *
 * - the request path, on `rawPath` and `requestContext.http.path`
 * - the query, as `rawQueryString` and as parsed `queryStringParameters`
 * - the endpoint, as the URL id in `requestContext.apiId` and `domainPrefix`,
 *   as the leading label of `requestContext.domainName`, and as the `host`
 *   header
 * - the caller's user agent and source IP, in `requestContext.http` and in the
 *   `user-agent` and `x-forwarded-for` headers
 * - the invocation time, as `requestContext.timeEpoch` and as the Common Log
 *   Format `requestContext.time`
 *
 * Overriding both copies of one of those with different values is still
 * allowed, and gives an event no real invocation would produce.
 */
export const lambdaFunctionUrlEventFactory =
  new DynamicFactory<SimLambdaFunctionUrlEvent>((overrides = {}) =>
    makeFunctionUrlEvent(functionUrlEventRequest(overrides)),
  );

function makeFunctionUrlEvent(
  request: FunctionUrlEventRequest,
): SimLambdaFunctionUrlEvent {
  const queryStringParameters = simPayload2QueryStringParameters(request.query);

  return {
    version: "2.0",
    routeKey: functionUrlDefaultKey,
    rawPath: request.path,
    rawQueryString: request.query.toString(),
    headers: eventHeaders(request),
    // Absent rather than empty for a request that carried no query, as it is
    // in a served event.
    ...(Object.keys(queryStringParameters).length > 0 && {
      queryStringParameters,
    }),
    requestContext: eventRequestContext(request),
    isBase64Encoded: false,
  };
}

function eventHeaders(
  request: FunctionUrlEventRequest,
): Record<string, string> {
  return {
    accept: "*/*",
    "user-agent": request.userAgent,
    ...simPayload2ProxyHeaders({
      domainName: request.domainName,
      traceId: simAwsProxiedTraceId(request.at),
      sourceIp: request.sourceIp,
    }),
  };
}

function eventRequestContext(
  request: FunctionUrlEventRequest,
): SimLambdaFunctionUrlEvent["requestContext"] {
  return {
    // An invocation of a NONE auth Function URL has no Account behind it, and
    // that is what AWS calls anonymous.
    accountId: simPayload2AnonymousAccountId,
    apiId: request.urlId,
    domainName: request.domainName,
    domainPrefix: request.urlId,
    http: {
      method: request.method,
      path: request.path,
      protocol: "HTTP/1.1",
      sourceIp: request.sourceIp,
      userAgent: request.userAgent,
    },
    requestId: faker.string.uuid(),
    routeKey: functionUrlDefaultKey,
    stage: functionUrlDefaultKey,
    time: simPayload2EventTime(request.at),
    timeEpoch: request.at.getTime(),
  };
}
