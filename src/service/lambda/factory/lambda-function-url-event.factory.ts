import type { ItemFactory } from "@kensio/part-factory";

import type { SimPayload2EndpointStyle } from "../../../serve/payload-2/sim-payload-2-endpoint-style.js";
import { simPayload2EventFactory } from "../../../serve/payload-2/sim-payload-2-event.factory.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../aws/sim-aws-region.js";
import { makeSimLambdaFunctionUrlId } from "../function/url/sim-lambda-function-url.js";
import { simLambdaFunctionUrlHost } from "../function/url/sim-lambda-function-url-host.js";
import type { SimLambdaFunctionUrlEvent } from "../serve/event/sim-lambda-url-event.type.js";

/**
 * The route key and stage a Function URL invocation always carries: there is
 * no route to match and no stage to deploy to, so real Lambda names both
 * `$default`, and neither says anything about the request.
 */
const functionUrlDefaultKey = "$default";

const functionUrlEndpointStyle: SimPayload2EndpointStyle = {
  makeEndpointId: makeSimLambdaFunctionUrlId,
  hostname: (urlId) =>
    simLambdaFunctionUrlHost({
      urlId,
      regionName: DEFAULT_SIM_AWS_REGION_NAME,
    }),
  stage: functionUrlDefaultKey,
  routeKeyFor: () => functionUrlDefaultKey,
  requestLineFor: () => ({}),
};

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
export const lambdaFunctionUrlEventFactory: ItemFactory<SimLambdaFunctionUrlEvent> =
  simPayload2EventFactory(functionUrlEndpointStyle);
