import {
  simProxyHeaders,
  type SimProxiedConnection,
} from "../proxy/sim-proxy-headers.js";

/**
 * The single-value and multi-value forms of one set of request values.
 */
export interface SimPayload1Values {
  readonly single: Record<string, string>;
  readonly multi: Record<string, string[]>;
}

/**
 * A map that is `null` when it holds nothing.
 *
 * Payload format 1.0 sends `null` for an empty map rather than leaving the
 * field out, and a handler checking `event.queryStringParameters === null`
 * depends on it.
 */
export function orNull<Value>(
  entries: Record<string, Value>,
): Record<string, Value> | null {
  return Object.keys(entries).length === 0 ? null : entries;
}

/**
 * The request headers, in both forms payload format 1.0 sends.
 *
 * The single-value map keeps the last value of a repeated header, which is
 * what real API Gateway does, and the multi-value map keeps them all. The
 * headers AWS rewrites itself land on top of whatever the client sent.
 */
export function simPayload1Headers(
  request: Request,
  proxied: SimProxiedConnection,
): SimPayload1Values {
  const multi = new Map<string, string[]>();

  // A repeated request header arrives already joined, because that is what the
  // Fetch API's Headers does with one. The multi-value map therefore reports
  // one joined value where real API Gateway would report each separately.
  request.headers.forEach((value, name) => {
    multi.set(name, [value]);
  });

  const awsHeaders = Object.entries(simProxyHeaders(proxied));

  for (const [name, value] of awsHeaders) {
    multi.set(name, [value]);
  }

  return valuesOf(multi);
}

/**
 * The query string, in both forms payload format 1.0 sends.
 *
 * The single-value map keeps the last value of a repeated key, which is what
 * real API Gateway does. Payload format 2.0 joins repeats with a comma
 * instead, and that difference is visible to a handler reading either.
 */
export function simPayload1QueryStringParameters(
  searchParameters: URLSearchParams,
): SimPayload1Values {
  const multi = new Map<string, string[]>();
  const keys = new Set(searchParameters.keys());

  for (const key of keys) {
    multi.set(key, searchParameters.getAll(key));
  }

  return valuesOf(multi);
}

/**
 * Both forms of a set of values, from the multi-value one.
 */
function valuesOf(multi: ReadonlyMap<string, string[]>): SimPayload1Values {
  return {
    single: Object.fromEntries(
      /* v8 ignore next -- every entry is set with at least one value */
      multi.entries().map(([name, values]) => [name, values.at(-1) ?? ""]),
    ),
    multi: Object.fromEntries(multi),
  };
}
