import { faker } from "@faker-js/faker";
import type { DeepPartialObject } from "@kensio/part-factory";

import { simAwsProxiedSourceIp } from "../../../serve/http/sim-aws-proxied-connection.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../aws/sim-aws-region.js";
import { makeSimLambdaFunctionUrlId } from "../function/url/sim-lambda-function-url.js";
import { simLambdaFunctionUrlHost } from "../function/url/sim-lambda-function-url-host.js";
import type { SimLambdaFunctionUrlEvent } from "../serve/event/sim-lambda-url-event.type.js";

/**
 * What a test says about the invocation it wants an event for.
 */
export type FunctionUrlEventOverrides =
  DeepPartialObject<SimLambdaFunctionUrlEvent>;

type FunctionUrlRequestContext = NonNullable<
  FunctionUrlEventOverrides["requestContext"]
>;

/**
 * The request one invocation event describes, with each part read once.
 *
 * A payload format 2.0 event states each of these in more than one field, so
 * reading them here, from whichever field the overrides used, is what lets the
 * defaults state them consistently.
 */
export interface FunctionUrlEventRequest {
  readonly at: Date;
  readonly urlId: string;
  readonly domainName: string;
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly sourceIp: string;
  readonly userAgent: string;
}

/**
 * Read the request the overrides describe, filling in what they left unsaid
 * with an anonymous `GET /` to a Function URL of the default region.
 */
export function functionUrlEventRequest(
  overrides: FunctionUrlEventOverrides,
): FunctionUrlEventRequest {
  const requestContext = overrides.requestContext ?? {};
  const http = requestContext.http ?? {};
  const headers = overrides.headers ?? {};
  const urlId = endpointUrlId(requestContext);

  return {
    at: new Date(requestContext.timeEpoch ?? Date.now()),
    urlId,
    domainName: requestContext.domainName ?? endpointHostname(urlId),
    method: http.method ?? "GET",
    path: overrides.rawPath ?? http.path ?? "/",
    query: eventQuery(overrides),
    sourceIp:
      http.sourceIp ?? headers["x-forwarded-for"] ?? simAwsProxiedSourceIp,
    userAgent:
      http.userAgent ?? headers["user-agent"] ?? faker.internet.userAgent(),
  };
}

/**
 * The URL id the endpoint names itself by, taken from whichever way the
 * overrides named it, or allocated as creating a Function URL would.
 */
function endpointUrlId(requestContext: FunctionUrlRequestContext): string {
  return (
    requestContext.apiId ??
    requestContext.domainPrefix ??
    requestContext.domainName?.split(".", 1)[0] ??
    makeSimLambdaFunctionUrlId()
  );
}

function endpointHostname(urlId: string): string {
  return simLambdaFunctionUrlHost({
    urlId,
    regionName: DEFAULT_SIM_AWS_REGION_NAME,
  });
}

/**
 * The query of the requested URL, read from whichever of the two fields
 * carrying it the overrides supplied.
 */
function eventQuery(overrides: FunctionUrlEventOverrides): URLSearchParams {
  if (overrides.rawQueryString !== undefined) {
    return new URLSearchParams(overrides.rawQueryString);
  }

  return new URLSearchParams(
    Object.entries(overrides.queryStringParameters ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
