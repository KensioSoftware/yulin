import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { simLambdaReportStatus } from "../invoke/sim-lambda-timed-out.error.js";
import type { SimLambdaFunctionLogging } from "./sim-lambda-function-logging.js";
import type { SimLambdaOutputSink } from "./sim-lambda-output-sink.js";

/**
 * What the platform lines of one invocation need to say.
 */
export interface SimLambdaPlatformLogInvocation {
  readonly requestId: string;

  /** The version the invocation ran, which is `$LATEST` or a number. */
  readonly version: string;
  readonly memorySizeMb: number;

  /** The clock the invocation's duration is measured on. */
  readonly clock: SimClock;
}

/**
 * What an invocation's `REPORT` line measures.
 */
export interface SimLambdaPlatformLogReport {
  readonly durationMs: number;

  /** Whether this invocation cold started its execution environment. */
  readonly coldStart: boolean;

  /** How the invocation ended, where that was not normally. */
  readonly status?: string | undefined;
}

/**
 * The memory a `REPORT` line says the invocation used, short of a function
 * given less.
 */
const nominalMemoryUsedMb = 64;

/**
 * The `START` line real Lambda writes before a handler runs.
 */
export function simLambdaStartLine(
  invocation: SimLambdaPlatformLogInvocation,
): string {
  return `START RequestId: ${invocation.requestId} Version: ${invocation.version}\n`;
}

/**
 * The `END` and `REPORT` lines real Lambda writes once a handler is done,
 * whether it returned or threw.
 *
 * Duration is measured on the simulation's clock, so it is the simulated time
 * the handler waited through. Billed duration rounds it up to the next
 * millisecond, as AWS bills. A cold start reports an init duration of zero,
 * since a cold start here costs no time. The memory used is a nominal figure
 * and is not measured, since the handler shares a process with everything else
 * in the test run.
 */
export function simLambdaEndLines(
  invocation: SimLambdaPlatformLogInvocation,
  report: SimLambdaPlatformLogReport,
): string {
  const { requestId, memorySizeMb } = invocation;
  const duration = Math.max(report.durationMs, 0);
  const memoryUsedMb = Math.min(nominalMemoryUsedMb, memorySizeMb);
  const fields = [
    `RequestId: ${requestId}`,
    `Duration: ${duration.toFixed(2)} ms`,
    `Billed Duration: ${String(Math.max(Math.ceil(duration), 1))} ms`,
    `Memory Size: ${String(memorySizeMb)} MB`,
    `Max Memory Used: ${String(memoryUsedMb)} MB`,
    ...(report.coldStart ? ["Init Duration: 0.00 ms"] : []),
    ...(report.status === undefined ? [] : [`Status: ${report.status}`]),
  ];

  return `END RequestId: ${requestId}\nREPORT ${fields.join("\t")}\t\n`;
}

/**
 * The log streams that have had an invocation written to them, so the next
 * one is not a cold start.
 */
const startedSinks = new WeakSet<SimLambdaOutputSink>();

/**
 * Run an invocation between its `START` line and its `END` and `REPORT`
 * lines, measuring the duration on the simulation's clock.
 *
 * The handler's own output is recorded inside those lines, so whatever it
 * left unterminated and any error it ended in come before `END`.
 *
 * The first invocation written to a stream is the execution environment's
 * cold start, and its `REPORT` line is the one that carries an init duration.
 * A function with nowhere to record its output writes none of these lines.
 */
export async function simLambdaPlatformLogged<T>(
  logging: SimLambdaFunctionLogging,
  invocation: SimLambdaPlatformLogInvocation,
  run: () => Promise<T>,
): Promise<T> {
  const { clock } = invocation;
  const sink = logging.outputScope().output;
  const startedAt = clock.now().getTime();
  const coldStart = sink !== undefined && !startedSinks.has(sink);

  if (sink !== undefined) {
    startedSinks.add(sink);
  }

  sink?.write(simLambdaStartLine(invocation));

  let status: string | undefined;

  try {
    return await logging.around(run);
  } catch (error) {
    status = simLambdaReportStatus(error);
    throw error;
  } finally {
    sink?.write(
      simLambdaEndLines(invocation, {
        durationMs: clock.now().getTime() - startedAt,
        coldStart,
        status,
      }),
    );
  }
}
