import { SimLambdaHttpRequest } from "./sim-lambda-http-request.js";
import { readSimLambdaHttpTarget } from "./sim-lambda-http-target.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * A `node:http` or `node:https` module, as far as this needs to know.
 */
type NodeHttpModule = Record<string, unknown>;

/**
 * The transport modules an SDK bundled into the function code archive reaches
 * the network through, named as both a bundler and a hand-written require may
 * ask for them, with the scheme each one carries.
 */
const httpModuleSchemes: ReadonlyMap<string, string> = new Map([
  ["http", "http:"],
  ["node:http", "http:"],
  ["https", "https:"],
  ["node:https", "https:"],
]);

/**
 * Whether a module specifier names an HTTP transport module.
 */
export function isSimLambdaHttpModuleSpecifier(specifier: string): boolean {
  return httpModuleSchemes.has(specifier);
}

/**
 * The scheme a transport module's requests are made with, for a specifier
 * naming one.
 */
export function simLambdaHttpModuleScheme(specifier: string): string {
  return httpModuleSchemes.get(specifier) ?? "https:";
}

type RequestFunction = (...callArguments: unknown[]) => unknown;

interface SimLambdaHttpModuleProperties {
  readonly hostModule: NodeHttpModule;
  readonly outbound: SimLambdaOutboundHttp;

  /**
   * The scheme this module's requests carry, `https:` unless said otherwise,
   * since the arguments to a request rarely name one.
   */
  readonly scheme?: string | undefined;
}

/**
 * Build the `node:http` or `node:https` module sim Lambda function code makes
 * its requests through.
 *
 * Everything the real module exports is kept, and only the two functions that
 * start a request are replaced, so a client library that reaches for an Agent,
 * a status code table or anything else finds the real thing. A request to a
 * hostname the simulation serves is answered by the simulation; every other
 * request is the host module's, made exactly as it was asked for.
 *
 * This is where a deployment package that bundles the AWS SDK is reached. The
 * bundled SDK resolves no module specifier the simulator can intercept, but it
 * still asks the runtime for its HTTP transport, and that is a module the
 * runtime provides. It is also what a handler reaching for `node:https`
 * directly gets, which an OAuth token exchange written without `fetch` does.
 */
export function makeSimLambdaHttpModule(
  properties: SimLambdaHttpModuleProperties,
): NodeHttpModule {
  const { hostModule } = properties;
  const hostRequest = hostModule["request"] as RequestFunction;
  const hostGet = hostModule["get"] as RequestFunction;

  return {
    ...hostModule,
    request: (...callArguments: unknown[]): unknown => {
      const simulated = simulatedRequest(callArguments, properties);

      return simulated ?? hostRequest(...callArguments);
    },
    /**
     * `get` is `request` with the body ended immediately, which is the whole
     * of the difference for a request the simulation answers.
     */
    get: (...callArguments: unknown[]): unknown => {
      const simulated = simulatedRequest(callArguments, properties);
      if (simulated === undefined) {
        return hostGet(...callArguments);
      }

      simulated.end();
      return simulated;
    },
  };
}

/**
 * Start a simulated request, for a call addressed to a hostname the simulation
 * serves.
 *
 * The response callback a caller passed is attached to the `response` event,
 * as the real module attaches it, so a caller using either receives the
 * response.
 */
function simulatedRequest(
  callArguments: readonly unknown[],
  properties: SimLambdaHttpModuleProperties,
): SimLambdaHttpRequest | undefined {
  const { outbound, scheme = "https:" } = properties;
  const target = readSimLambdaHttpTarget(callArguments);
  if (target === undefined || !outbound.serves(target.hostname)) {
    return undefined;
  }

  const request = new SimLambdaHttpRequest({ target, outbound, scheme });

  const callback = callArguments.at(-1);
  if (typeof callback === "function") {
    request.on("response", callback as (response: unknown) => void);
  }

  return request;
}
