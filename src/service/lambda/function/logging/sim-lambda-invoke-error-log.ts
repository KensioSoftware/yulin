import { functionErrorDocument } from "../../command/invoke/invoke-payload.js";

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
