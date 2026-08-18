import type {
  SimSdkWireRequest,
  SimSdkWireResponse,
} from "../../../../sdk/wire/sim-sdk-wire.types.js";

/**
 * Read an outbound request as the AWS API request it is on the wire.
 *
 * Header names come back lower-cased because that is how `Headers` iterates
 * them, which is also what the wire dispatcher looks them up by.
 */
export async function simLambdaOutboundWireRequest(
  request: Request,
): Promise<SimSdkWireRequest> {
  const url = new URL(request.url);

  return {
    method: request.method,
    hostname: url.hostname,
    path: `${url.pathname}${url.search}`,
    headers: Object.fromEntries(request.headers),
    body: new Uint8Array(await request.arrayBuffer()),
  };
}

/**
 * Present an AWS API response from the wire as the response a client reads.
 *
 * An empty body is passed as no body at all, because the statuses that carry
 * none refuse to be built with one.
 */
export function simLambdaOutboundWireResponse(
  response: SimSdkWireResponse,
): Response {
  return new Response(response.body.length === 0 ? null : response.body, {
    status: response.statusCode,
    headers: { ...response.headers },
  });
}
