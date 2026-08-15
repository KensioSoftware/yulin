import { Console } from "node:console";
import vm from "node:vm";
import { makeSimClockDate } from "../../../../../util/clock/sim-clock-date.js";
import {
  type SimClock,
  SimRealClock,
} from "../../../../../util/clock/sim-clock.js";
import type { SimLambdaEnvironment } from "../../environment/sim-lambda-environment.js";
import { SimLambdaVmOutputStream } from "./sim-lambda-vm-output-stream.js";

/**
 * Create the sandbox vm context that sim Lambda function code runs in.
 *
 * The context provides the common globals a Node.js Lambda runtime offers,
 * including an AWS-like process.env holding the standard runtime variables
 * and any variables declared for the function, and the writable standard
 * streams function code writes its output to. Everything else must be part
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
  // Writable standard streams, as the real runtime provides. Code that builds
  // its own console over them, as AWS Lambda Powertools' logger does, throws
  // at module load without them.
  const stdout = new SimLambdaVmOutputStream(() => process.stdout);
  const stderr = new SimLambdaVmOutputStream(() => process.stderr);

  return vm.createContext({
    // The sandbox's console is built over those streams, as the real
    // runtime's is, so everything function code prints goes to one place
    // whether it printed through the console or wrote to the stream itself.
    console: new Console({ stdout, stderr }),
    Buffer,
    process: {
      env: environment.variables(),
      stdout,
      stderr,
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
