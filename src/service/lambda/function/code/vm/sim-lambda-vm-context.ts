import { Console } from "node:console";
import vm from "node:vm";
import { makeSimClockDate } from "../../../../../util/clock/sim-clock-date.js";
import {
  type SimClock,
  SimRealClock,
} from "../../../../../util/clock/sim-clock.js";
import type { SimLambdaEnvironment } from "../../environment/sim-lambda-environment.js";
import {
  simLambdaNoOutputSink,
  type SimLambdaOutputSink,
} from "../../logging/sim-lambda-output-sink.js";
import { makeSimLambdaOutboundFetch } from "../../outbound/sim-lambda-outbound-fetch.js";
import type { SimLambdaOutboundHttp } from "../../outbound/sim-lambda-outbound-http.js";
import { SimLambdaVmOutputStream } from "./sim-lambda-vm-output-stream.js";

/**
 * What the sandbox a function's code runs in is built from.
 */
export interface SimLambdaVmContextProperties {
  readonly environment: SimLambdaEnvironment;

  /** The time the sandbox reports, the real one by default. */
  readonly clock?: SimClock | undefined;

  /** Where the sandbox's output is recorded, nowhere by default. */
  readonly sink?: SimLambdaOutputSink | undefined;

  /**
   * Where the sandbox's `fetch` requests to hostnames the simulation serves
   * are answered. Without one every request reaches the network, as the host
   * `fetch` would.
   */
  readonly outboundHttp?: SimLambdaOutboundHttp | undefined;
}

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
 * nothing outside the sandbox is touched to arrange that. The same goes for
 * the HTTP clients: the `fetch` in here is the sandbox's own, and it answers
 * from the simulation for the hostnames the simulation serves.
 */
export function makeSimLambdaVmContext(
  properties: SimLambdaVmContextProperties,
): vm.Context {
  const {
    environment,
    clock = new SimRealClock(),
    sink = simLambdaNoOutputSink,
    outboundHttp,
  } = properties;

  // Writable standard streams, as the real runtime provides. Code that builds
  // its own console over them, as AWS Lambda Powertools' logger does, throws
  // at module load without them.
  const stdout = new SimLambdaVmOutputStream(() => process.stdout);
  const stderr = new SimLambdaVmOutputStream(() => process.stderr);

  // What function code writes reaches the function's log group through here.
  stdout.recordTo(sink);
  stderr.recordTo(sink);

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
    // The Fetch API the Node.js runtime provides, with the client itself
    // routed into the simulation. The rest are the host's own, so the objects
    // a handler builds and the ones the simulation answers with are the same
    // kind of thing.
    fetch: makeSimLambdaOutboundFetch(outboundHttp),
    Headers,
    Request,
    Response,
    FormData,
    Blob,
    AbortController,
    AbortSignal,
  });
}
