import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimLambdaOutputSink } from "../logging/sim-lambda-output-sink.js";
import type { SimLambdaOutboundHttp } from "../outbound/sim-lambda-outbound-http.js";
import { simLambdaProcessClock } from "./sim-lambda-process-clock.js";
import { simLambdaProcessOutbound } from "./sim-lambda-process-outbound.js";
import { simLambdaProcessOutput } from "./sim-lambda-process-output.js";

/**
 * What an invocation of host-scope code has bridged to it.
 */
interface SimLambdaHostScope {
  /** The time the invocation reports as the current time. */
  readonly clock: SimClock;

  /**
   * Where the requests the invocation makes to hostnames the simulation
   * serves are answered. A function outside a simulated environment has none,
   * and its requests go where they were addressed.
   */
  readonly outboundHttp: SimLambdaOutboundHttp | undefined;

  /**
   * Where what the invocation prints is recorded. A function built standalone,
   * outside a SimAws instance, has no simulated CloudWatch Logs to record to,
   * and its output reaches the host console alone.
   */
  readonly output: SimLambdaOutputSink | undefined;
}

/**
 * Run an invocation of code in the host scope with the process globals it
 * reads bridged to its simulation.
 *
 * Only code running in the host scope needs this. Zip code reads the Date, the
 * HTTP clients and the standard streams its own vm sandbox was given, so a
 * function backed by one leaves the globals alone entirely and never comes
 * here.
 */
export async function runSimLambdaInHostScope<T>(
  scope: SimLambdaHostScope,
  run: () => Promise<T>,
): Promise<T> {
  const { clock, outboundHttp, output } = scope;

  const recording =
    output === undefined
      ? run
      : async (): Promise<T> => await simLambdaProcessOutput.run(output, run);

  const reachingTheSimulation =
    outboundHttp === undefined
      ? recording
      : async (): Promise<T> =>
          await simLambdaProcessOutbound.run(outboundHttp, recording);

  return await simLambdaProcessClock.run(clock, reachingTheSimulation);
}
