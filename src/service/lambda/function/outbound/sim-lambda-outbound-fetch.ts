import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * What `fetch` is addressed with, as the Node.js runtime accepts it.
 */
type SimLambdaFetchInput = string | URL | Request;

/**
 * Where a call to `fetch` is addressed, or undefined when the arguments name
 * no hostname at all.
 *
 * Arguments that name none are left to the host `fetch` and its own error
 * message, rather than being given one invented here.
 */
function fetchHostname(input: SimLambdaFetchInput): string | undefined {
  if (input instanceof URL) {
    return input.hostname;
  }

  const url = typeof input === "string" ? input : input.url;

  return URL.parse(url)?.hostname;
}

/**
 * Build the `fetch` sim Lambda function code is given.
 *
 * A request to a hostname the simulation serves is answered by the simulation,
 * and everything else is the host `fetch`'s, made exactly as it was asked for.
 * The arguments are passed on untouched in that case, so a request carrying a
 * streaming body is not read here on its way past.
 *
 * This is the client a Node.js handler reaches for first, and the only one an
 * OAuth token exchange needs, so it routes the same way the transport modules
 * do rather than being the one client that leaves the simulation.
 */
export function makeSimLambdaOutboundFetch(
  outbound: SimLambdaOutboundHttp | undefined,
  hostFetch: typeof fetch = fetch,
): typeof fetch {
  return async (
    input: SimLambdaFetchInput,
    init?: RequestInit,
  ): Promise<Response> => {
    const hostname = fetchHostname(input);

    if (
      outbound === undefined ||
      hostname === undefined ||
      !outbound.serves(hostname)
    ) {
      return await hostFetch(input, init);
    }

    return await outbound.fetch(new Request(input, init));
  };
}
