import vm from "node:vm";

import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import {
  type CffCloudFrontModule,
  cffCloudFrontModule,
} from "../kvs/cff-cloudfront-module.js";
import { cffSourceWithoutCloudFrontImport } from "./cff-cloudfront-import.js";

/**
 * How long the top level of a Function's source may take to evaluate.
 *
 * This is a watchdog against a top level that never returns (a `while (true)`
 * outside the handler), and it is deliberately nothing like the 50ms real
 * CloudFront allows. That 50ms is compute for one invocation, and evaluating
 * the source is a separate thing that happens once, at CreateFunction.
 *
 * A `vm` timeout counts wall clock, and the wall clock a top level of a few
 * string literals occupies is decided by what else the machine is doing.
 * Measured on 18 cores with three burner threads per core, that evaluation
 * ran a median 0.023ms and a worst 153ms. At twelve threads per core the
 * worst went to 437ms, and issue #926 recorded 244.6ms on 8 vCPUs under a
 * Vitest pool. The tail grows with contention, which puts 500ms inside the
 * range a busy CI machine already reaches. Five seconds sits an order of
 * magnitude above it, and still ends a genuine hang before Vitest's own
 * 10 second timeout reports something less specific.
 */
const cffLoadWatchdogMs = 5000;

/**
 * Compile CloudFront Function source and hand back its handler.
 *
 * The source runs in a vm context of its own, which is the closest thing here
 * to the isolate real CloudFront gives a Function. The context holds this
 * Function's own `cf`, so two Functions running in one process each read the
 * key value store they are associated with and nothing else. A Function with no
 * association still gets a `cf`, one that refuses when asked to open a store.
 */
export function cffHandlerFromSource(
  source: string,
  cloudFront: CffCloudFrontModule = cffCloudFrontModule(undefined),
  watchdogMs: number = cffLoadWatchdogMs,
): CloudFrontFunction.Handler {
  const context = vm.createContext({ console, cf: cloudFront });
  const script = new vm.Script(`
    ${cffSourceWithoutCloudFrontImport(source)}
    handler;
    `);

  const handler = runSource(script, context, watchdogMs);

  if (typeof handler !== "function") {
    throw new TypeError(
      "CloudFront Function code did not define a handler function",
    );
  }

  return handler;
}

/**
 * Evaluate the script under the watchdog, naming the cause if it fires.
 *
 * `vm` reports a timeout as "Script execution timed out after 5000ms", which
 * says what the watchdog did and leaves the reader to guess why. Everything
 * else the source throws goes up as it is.
 */
function runSource(
  script: vm.Script,
  context: vm.Context,
  watchdogMs: number,
): CloudFrontFunction.Handler {
  try {
    return script.runInContext(context, {
      timeout: watchdogMs,
      breakOnSigint: true,
    }) as CloudFrontFunction.Handler;
  } catch (error) {
    if (isLoadTimeout(error)) {
      throw new Error(
        `CloudFront Function code did not finish loading within ${watchdogMs}ms.` +
          " The top level of the source, outside the handler function, has to return.",
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Recognise the error `vm` throws when the watchdog fires.
 *
 * The error comes from the sandbox realm and carries a different `Error`
 * prototype from this one, so `instanceof` says no to it. The code it carries
 * is the same in either realm.
 */
function isLoadTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
  );
}
