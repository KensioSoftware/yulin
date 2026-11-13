import { functionErrorDocument } from "../../command/invoke/invoke-payload.js";
import type { SimLambdaLogWriter } from "./sim-lambda-log-writer.js";

/**
 * What real Lambda writes to a function's log group when an invocation ends in
 * an error nothing caught.
 *
 * The runtime prints `ERROR Invoke Error` and a JSON document holding the
 * error's type, its message and its stack, one array element per frame. The
 * whole document is one line. CloudWatch Logs records a line as an event, so a
 * filter matching the message finds every frame with it.
 *
 * The keys are the ones the runtime uses. The log line says `stack` where the
 * Invoke response payload says `trace`, and the two hold the same frames.
 */
export function simLambdaInvokeErrorLine(error: unknown): string {
  const { errorType, errorMessage, trace } = functionErrorDocument(error);
  const document = JSON.stringify({ errorType, errorMessage, stack: trace });

  return `ERROR Invoke Error ${document}\n`;
}

/**
 * Record an invocation that ended in an error nothing caught, as real Lambda's
 * runtime records one.
 *
 * The caller still gets the error: an Invoke answers with `FunctionError` and
 * the trace in its payload as before, and this only puts the same failure in
 * the place code goes looking for it. Whatever the handler wrote without
 * closing the line is a line of its own first. A handler that printed half a
 * line before failing would otherwise have the error appended to it, where a
 * filter for the error misses it.
 */
export function simLambdaRecordInvokeError(
  writer: SimLambdaLogWriter | undefined,
  error: unknown,
): void {
  writer?.flush();
  writer?.write(simLambdaInvokeErrorLine(error));
}
