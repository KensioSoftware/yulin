import type { SimLambdaEnvironment } from "../environment/sim-lambda-environment.js";
import type { SimLambdaOutputSink } from "../logging/sim-lambda-output-sink.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

/**
 * The function settings a change to which reaches the code itself.
 *
 * The environment is what the code reads its variables from, and the handler
 * name is what finds the export to run inside a code archive.
 */
export interface SimLambdaCodeConfiguration {
  readonly environment: SimLambdaEnvironment;
  readonly handlerName: string | undefined;
}

/**
 * Executable code backing a sim Lambda function.
 *
 * Getting the handler function may throw an AWS-like Runtime.* error, as a
 * real Lambda cold start surfaces module import and handler lookup problems
 * at invocation time rather than at function creation.
 */
export interface SimLambdaExecutableCode {
  /**
   * Whether this code runs in the host process's own global scope rather than
   * in a sandbox of its own.
   *
   * Code in the host scope reads the host globals, so an invocation has to
   * bridge process.env and Date to give it the function's environment and the
   * simulation's time. Sandboxed code already has both and needs neither
   * global touched.
   */
  readonly runsInHostScope: boolean;

  /**
   * Record what this code writes to its standard streams, so an invocation's
   * output reaches the function's log group.
   */
  recordOutputTo(sink: SimLambdaOutputSink): void;

  /**
   * This code under changed function settings, cold rather than warm.
   *
   * UpdateFunctionConfiguration replaces a real function's execution
   * environment, so the next invocation starts one afresh under the new
   * settings. Code holding neither the environment nor the handler name has
   * nothing to rebuild and answers with itself.
   */
  reconfigured(
    configuration: SimLambdaCodeConfiguration,
  ): SimLambdaExecutableCode;

  handlerFunction(): SimLambdaHandler;
}

/**
 * Executable code backed directly by a real handler function reference.
 */
export class SimLambdaHandlerReferenceCode implements SimLambdaExecutableCode {
  /**
   * A referenced handler is a closure over the module scope it was written
   * in, which is the host process's.
   */
  readonly runsInHostScope = true;

  constructor(private readonly handler: SimLambdaHandler) {}

  /**
   * Record nothing here.
   *
   * A referenced handler has no streams of its own to tee. It is an ordinary
   * function closing over the test's own module scope, and it prints through
   * the process console and the process standard streams. Its invocation is
   * run with those bridged to the function's sink instead, the way the clock
   * and process.env are bridged for the same code.
   */
  recordOutputTo(): void {
    // Recorded by the invocation, from the process globals.
  }

  /**
   * Answer with this code unchanged.
   *
   * A referenced handler was given directly rather than found by name, and it
   * reads process.env, which the invocation applies from the function's
   * current environment. Neither setting is held here.
   */
  reconfigured(): SimLambdaExecutableCode {
    return this;
  }

  /**
   * Get the referenced handler function.
   */
  handlerFunction(): SimLambdaHandler {
    return this.handler;
  }
}
