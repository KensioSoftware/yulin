import vm from "node:vm";
import type { SimLambdaEnvironment } from "../../environment/sim-lambda-environment.js";

/**
 * Create the sandbox vm context that sim Lambda function code runs in.
 *
 * The context provides the common globals a Node.js Lambda runtime offers,
 * including an AWS-like process.env holding the standard runtime variables
 * and any variables declared for the function. Everything else must be part
 * of the deployed function code archive, as on real Lambda.
 *
 * Zip code needs nothing like the process.env handling the in-process handler
 * path does: this sandbox already owns its process object, so the host
 * environment is invisible here whether or not the function declares
 * variables of its own.
 */
export function makeSimLambdaVmContext(
  environment: SimLambdaEnvironment,
): vm.Context {
  return vm.createContext({
    console,
    Buffer,
    process: {
      env: environment.variables(),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    queueMicrotask,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    structuredClone,
    crypto,
  });
}
