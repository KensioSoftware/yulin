import { faker } from "@faker-js/faker";
import type { DeepPartialObject } from "@kensio/part-factory";

import { simAwsProxiedSourceIp } from "../http/sim-aws-proxied-connection.js";
import { simPayload2EventQuery } from "./sim-payload-2-event-query.js";
import type { SimPayload2EndpointStyle } from "./sim-payload-2-endpoint-style.js";
import type { SimPayload2Event } from "./sim-payload-2-event.type.js";

/**
 * What a test says about the invocation it wants an event for.
 */
export type SimPayload2EventOverrides = DeepPartialObject<SimPayload2Event>;

type SimPayload2ContextOverrides = NonNullable<
  SimPayload2EventOverrides["requestContext"]
>;

/**
 * The request one invocation event describes, with each part read once.
 *
 * A payload format 2.0 event states each of these in more than one field, so
 * reading them here, from whichever field the overrides used, is what lets the
 * defaults state them consistently.
 */
export interface SimPayload2EventRequest {
  readonly at: Date;
  readonly endpointId: string;
  readonly domainName: string;
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly routeKey: string;
  readonly stage: string;
  readonly sourceIp: string;
  readonly userAgent: string;
}

/**
 * Read the request the overrides describe, filling in what they left unsaid
 * with an anonymous `GET /` to an endpoint of the given kind.
 */
export function simPayload2EventRequest(
  overrides: SimPayload2EventOverrides,
  style: SimPayload2EndpointStyle,
): SimPayload2EventRequest {
  const requestContext = overrides.requestContext ?? {};
  const http = requestContext.http ?? {};
  const headers = overrides.headers ?? {};
  const routeKey = overrides.routeKey ?? requestContext.routeKey;
  const routed = routeKey === undefined ? {} : style.requestLineFor(routeKey);

  const endpointId = endpointIdOf(requestContext, style);
  const method = http.method ?? routed.method ?? "GET";
  const path = overrides.rawPath ?? http.path ?? routed.path ?? "/";

  return {
    at: new Date(requestContext.timeEpoch ?? Date.now()),
    endpointId,
    domainName: requestContext.domainName ?? style.hostname(endpointId),
    method,
    path,
    query: simPayload2EventQuery(overrides),
    // The event names the route twice, so a test naming it once, either way
    // round, gets an event that agrees with itself.
    routeKey: routeKey ?? style.routeKeyFor(method, path),
    stage: style.stage,
    sourceIp:
      http.sourceIp ?? headers["x-forwarded-for"] ?? simAwsProxiedSourceIp,
    userAgent:
      http.userAgent ?? headers["user-agent"] ?? faker.internet.userAgent(),
  };
}

/**
 * The id the endpoint names itself by, taken from whichever way the overrides
 * named it, or allocated as creating such an endpoint would.
 */
function endpointIdOf(
  requestContext: SimPayload2ContextOverrides,
  style: SimPayload2EndpointStyle,
): string {
  return (
    requestContext.apiId ??
    requestContext.domainPrefix ??
    requestContext.domainName?.split(".", 1)[0] ??
    style.makeEndpointId()
  );
}
