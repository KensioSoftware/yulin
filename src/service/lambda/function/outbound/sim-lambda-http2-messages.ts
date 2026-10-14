import type http2 from "node:http2";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * The header a request sent on a simulated session carries to say which
 * request it is, so the answer runs in the asynchronous context the request
 * was sent from. The simulation never sees it.
 */
export const simLambdaHttp2ExchangeHeaderName = "x-yulin-sim-lambda-exchange";

/**
 * The response headers HTTP/2 forbids, which a simulated answer may still
 * carry from an HTTP/1.1 shape.
 */
const connectionHeaderNames: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
]);

/**
 * The headers of a request, less the HTTP/2 pseudo-headers and the exchange
 * tag.
 */
function requestHeaders(
  headers: http2.IncomingHttpHeaders,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      value === undefined ||
      name === simLambdaHttp2ExchangeHeaderName ||
      name.startsWith(":")
        ? []
        : [[name, Array.isArray(value) ? value.join(", ") : value]],
    ),
  );
}

/**
 * The headers of a simulated answer that HTTP/2 can carry.
 */
export function simLambdaHttp2ResponseHeaders(
  headers: Headers,
): Record<string, string> {
  return Object.fromEntries(
    [...headers].filter(([name]) => !connectionHeaderNames.has(name)),
  );
}

/**
 * The request a stream carried, as the request the simulation is asked to
 * answer, at the authority the session was connected to.
 *
 * A pooled session outlives the invocation that opened it. A request sent on
 * it once no invocation is running has nothing to answer it, and is refused
 * saying so.
 */
export async function simLambdaHttp2Request(
  authority: URL,
  outbound: SimLambdaOutboundHttp,
  request: http2.Http2ServerRequest,
): Promise<Request> {
  const { hostname, host, protocol } = authority;
  if (!outbound.serves(hostname)) {
    throw sessionEndedError(hostname);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks);

  return new Request(`${protocol}//${host}${request.url}`, {
    method: request.method,
    headers: requestHeaders(request.headers),
    ...(body.length > 0 && { body }),
  });
}

/**
 * The exchange tag a request on a simulated session carries.
 */
export function simLambdaHttp2ExchangeId(
  request: http2.Http2ServerRequest,
): string {
  // oxlint-disable-next-line security/detect-object-injection -- this module's own fixed header name.
  return String(request.headers[simLambdaHttp2ExchangeHeaderName]);
}

/**
 * The options and listener a `connect` call passed after the authority. The
 * listener comes back as a list of none or one, to pass on as it came.
 */
export function simLambdaHttp2ConnectArguments(
  callArguments: readonly unknown[],
): { readonly options: object | undefined; readonly listener: unknown[] } {
  const [, second, third] = callArguments;
  const listener = typeof second === "function" ? second : third;

  return {
    options: typeof second === "object" ? (second ?? undefined) : undefined,
    listener: listener === undefined ? [] : [listener],
  };
}

/**
 * Refuse a request on a session a sim Lambda invocation opened, sent once no
 * invocation is running to answer it.
 */
function sessionEndedError(hostname: string): Error {
  return new Error(
    `Cannot send a request to ${hostname} on an HTTP/2 session a sim ` +
      "Lambda invocation opened, once no invocation is running. Create " +
      "the SDK client inside the handler, or send this call from a " +
      "handler invocation.",
  );
}
