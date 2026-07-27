import vm from "node:vm";
import { makeSimClockDate } from "../../../../../util/clock/sim-clock-date.js";
import {
  type SimClock,
  SimRealClock,
} from "../../../../../util/clock/sim-clock.js";
import type { SimLambdaEnvironment } from "../../environment/sim-lambda-environment.js";

/**
 * Create the sandbox vm context that sim Lambda function code runs in.
 *
 * The context provides the common globals a Node.js Lambda runtime offers,
 * including an AWS-like process.env holding the standard runtime variables
 * and any variables declared for the function. Everything else must be part
 * of the deployed function code archive, as on real Lambda.
 *
 * Zip code needs nothing like the process.env and Date handling the
 * in-process handler path does: this sandbox already owns its globals, so
 * both the host environment and the host clock are invisible here, and
 * nothing outside the sandbox is touched to arrange that.
 */
export function makeSimLambdaVmContext(
  environment: SimLambdaEnvironment,
  clock: SimClock = new SimRealClock(),
): vm.Context {
  return vm.createContext({
    console,
    Buffer,
    process: {
      env: environment.variables(),
    },
    // Function code asking JavaScript for the time gets the simulation's
    // time, so a frozen or advanced clock reaches the code under test.
    Date: makeSimClockDate(clock),
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
