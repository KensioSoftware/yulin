import type { SimSdkWireHandler } from "../../../../../../sdk/wire/sim-sdk-wire.types.js";
import {
  isSimAwsEndpointHostname,
  readSimLambdaVmHttpTarget,
} from "./sim-lambda-vm-http-target.js";
import { SimLambdaVmWireRequest } from "./sim-lambda-vm-wire-request.js";

/**
 * A `node:http` or `node:https` module, as far as this needs to know.
 */
type NodeHttpModule = Record<string, unknown>;

/**
 * The transport modules an SDK bundled into the function code archive reaches
 * the network through, named as both a bundler and a hand-written require may
 * ask for them.
 */
const httpModuleSpecifiers: ReadonlySet<string> = new Set([
  "http",
  "https",
  "node:http",
  "node:https",
]);

/**
 * Whether a module specifier names an HTTP transport module.
 */
export function isSimLambdaVmHttpModuleSpecifier(specifier: string): boolean {
  return httpModuleSpecifiers.has(specifier);
}

type RequestFunction = (...callArguments: unknown[]) => unknown;

/**
 * Build the `node:http` or `node:https` module sim Lambda function code is
 * given.
 *
 * Everything the real module exports is kept, and only the two functions that
 * start a request are replaced, so a client library that reaches for an Agent,
 * a status code table or anything else finds the real thing. A request to an
 * AWS API endpoint is answered by the simulation; every other request is the
 * host module's, made exactly as it was asked for.
 *
 * This is where a deployment package that bundles the AWS SDK is reached. The
 * bundled SDK resolves no module specifier the simulator can intercept, but it
 * still asks the runtime for its HTTP transport, and that is a module the
 * runtime provides.
 */
export function makeSimLambdaVmHttpModule(
  hostModule: NodeHttpModule,
  handler: SimSdkWireHandler,
): NodeHttpModule {
  const hostRequest = hostModule["request"] as RequestFunction;
  const hostGet = hostModule["get"] as RequestFunction;

  const request = (...callArguments: unknown[]): unknown => {
    const simulated = simulatedRequest(callArguments, handler);

    return simulated ?? hostRequest(...callArguments);
  };

  return {
    ...hostModule,
    request,
    /**
     * `get` is `request` with the body ended immediately, which is the whole
     * of the difference for a request the simulation answers.
     */
    get: (...callArguments: unknown[]): unknown => {
      const simulated = simulatedRequest(callArguments, handler);
      if (simulated === undefined) {
        return hostGet(...callArguments);
      }

      simulated.end();
      return simulated;
    },
  };
}

/**
 * Start a simulated request, for a call addressed to an AWS API endpoint.
 *
 * The response callback a caller passed is attached to the `response` event,
 * as the real module attaches it, so a caller using either receives the
 * response.
 */
function simulatedRequest(
  callArguments: readonly unknown[],
  handler: SimSdkWireHandler,
): SimLambdaVmWireRequest | undefined {
  const target = readSimLambdaVmHttpTarget(callArguments);
  if (target === undefined || !isSimAwsEndpointHostname(target.hostname)) {
    return undefined;
  }

  const request = new SimLambdaVmWireRequest(target, handler);

  const callback = callArguments.at(-1);
  if (typeof callback === "function") {
    request.on("response", callback as (response: unknown) => void);
  }

  return request;
}
