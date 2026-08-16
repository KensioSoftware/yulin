import { faker } from "@faker-js/faker";
import { DynamicFactory, type ItemFactory } from "@kensio/part-factory";

import { simAwsProxiedTraceId } from "../http/sim-aws-proxied-connection.js";
import type { SimPayload2EndpointStyle } from "./sim-payload-2-endpoint-style.js";
import { simPayload2EventTime } from "./sim-payload-2-event-time.js";
import {
  type SimPayload2EventRequest,
  simPayload2EventRequest,
} from "./sim-payload-2-event-request.js";
import type { SimPayload2Event } from "./sim-payload-2-event.type.js";
import { simPayload2AnonymousAccountId } from "./sim-payload-2-iam-caller.js";
import {
  simPayload2ProxyHeaders,
  simPayload2QueryStringParameters,
} from "./sim-payload-2-request-parts.js";

/**
 * Build the factory making the invocation events of one kind of payload format
 * 2.0 endpoint.
 *
 * The event is the same whichever endpoint delivered it, so this is the whole
 * of it, and each service supplies only what its own endpoints call themselves.
 * The defaults describe an unauthenticated `GET /`, down to the headers AWS
 * stamps on a request it proxies, and are computed from the overrides so that
 * the fields a real event repeats stay in step with each other.
 */
export function simPayload2EventFactory(
  style: SimPayload2EndpointStyle,
): ItemFactory<SimPayload2Event> {
  return new DynamicFactory<SimPayload2Event>((overrides = {}) =>
    makePayload2Event(simPayload2EventRequest(overrides, style)),
  );
}

function makePayload2Event(request: SimPayload2EventRequest): SimPayload2Event {
  const queryStringParameters = simPayload2QueryStringParameters(request.query);

  return {
    version: "2.0",
    routeKey: request.routeKey,
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
  request: SimPayload2EventRequest,
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
  request: SimPayload2EventRequest,
): SimPayload2Event["requestContext"] {
  return {
    // An invocation the endpoint did not authenticate has no Account behind
    // it, and that is what AWS calls anonymous.
    accountId: simPayload2AnonymousAccountId,
    apiId: request.endpointId,
    domainName: request.domainName,
    domainPrefix: request.endpointId,
    http: {
      method: request.method,
      path: request.path,
      protocol: "HTTP/1.1",
      sourceIp: request.sourceIp,
      userAgent: request.userAgent,
    },
    requestId: faker.string.uuid(),
    routeKey: request.routeKey,
    stage: request.stage,
    time: simPayload2EventTime(request.at),
    timeEpoch: request.at.getTime(),
  };
}
