import type { ItemFactory } from "@kensio/part-factory";

import type {
  SimPayload2EndpointStyle,
  SimPayload2RequestLine,
} from "../../../serve/payload-2/sim-payload-2-endpoint-style.js";
import { simPayload2EventFactory } from "../../../serve/payload-2/sim-payload-2-event.factory.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../aws/sim-aws-region.js";
import { simHttpApiHost } from "../api/sim-http-api-host.js";
import { makeSimHttpApiId } from "../api/sim-http-api-id.js";
import { simHttpApiAnyMethod } from "../api/route/key/sim-http-api-route-method.js";
import { simHttpApiDefaultStageName } from "../api/stage/sim-http-api-stage.js";

const httpApiEndpointStyle: SimPayload2EndpointStyle = {
  makeEndpointId: makeSimHttpApiId,
  hostname: (apiId) =>
    simHttpApiHost({ apiId, regionName: DEFAULT_SIM_AWS_REGION_NAME }),
  stage: simHttpApiDefaultStageName,
  routeKeyFor: (method, path) => `${method} ${path}`,
  requestLineFor: routeKeyRequestLine,
};

/**
 * Makes the invocation events an HTTP API sends an `AWS_PROXY` integration, so
 * a test of an integration handler can say what the request was rather than
 * writing out the payload format 2.0 event around it.
 *
 * The defaults describe an unauthorized `GET /` reaching the API's default
 * stage. A named variation of a request composes as any other `part-factory`
 * factory does:
 *
 * ```typescript
 * const orderRequestFactory = new VariantFactory(httpApiProxyEventFactory, {
 *   routeKey: "GET /orders/{orderId}",
 *   rawPath: "/orders/YL-1",
 *   pathParameters: { orderId: "YL-1" },
 * });
 * ```
 *
 * The route key and the request agree by default, whichever a test gives: an
 * event for `rawPath: "/orders"` is one for the `GET /orders` route, and an
 * event for `routeKey: "POST /orders"` is a POST to `/orders`. A route key
 * whose path is a template captures nothing on its own, so an event for a
 * parameterised route says the concrete path and its `pathParameters` itself,
 * as the variant above does.
 *
 * What a real event otherwise repeats — the query, the endpoint's identity and
 * hostname, the caller's user agent and address, and the invocation time —
 * stays in step with itself in the same way, so supplying either copy of one
 * of them sets both. `requestContext.authorizer` is left out, as it is for a
 * route with no authorizer, and adding it is how a test describes one that has
 * been through a JWT, IAM or Lambda authorizer.
 */
export const httpApiProxyEventFactory: ItemFactory<SimPayload2Event> =
  simPayload2EventFactory(httpApiEndpointStyle);

/**
 * What an HTTP API route key says about the request that matched it.
 *
 * `$default` names no method and no path, so it says nothing. A path holding a
 * parameter is a template rather than a path a request asked for, and `ANY` is
 * a method no request uses: an `ANY /orders` route reports in its event the
 * method the request actually came in with. Neither of those says what the
 * request was, while the other half of the same route key still does.
 */
function routeKeyRequestLine(routeKey: string): SimPayload2RequestLine {
  const [method, path, ...rest] = routeKey.split(" ");

  if (method === undefined || path === undefined || rest.length > 0) {
    return {};
  }

  return {
    ...(method !== simHttpApiAnyMethod && { method }),
    ...(!path.includes("{") && { path }),
  };
}
