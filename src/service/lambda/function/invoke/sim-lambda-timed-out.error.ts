import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";

/** What real Lambda calls an invocation that ran out of time. */
const timedOutErrorType = "Sandbox.Timedout";

interface SimLambdaTimedOutProperties {
  /** The instant the invocation's time ran out. */
  readonly at: Date;
  readonly awsRequestId: string;
  readonly timeoutSeconds: number;
}

/**
 * The error real Lambda answers a caller with when time ran out.
 *
 * The message names the invocation and how long it had, the way the runtime
 * writes it to the log group and puts it in the Invoke response payload.
 */
export function simLambdaTimedOutError(
  properties: SimLambdaTimedOutProperties,
): SimLambdaRuntimeError {
  const { at, awsRequestId, timeoutSeconds } = properties;
  const error = new SimLambdaRuntimeError(
    timedOutErrorType,
    `${at.toISOString()} ${awsRequestId} Task timed out after ${timeoutSeconds.toFixed(2)} seconds`,
  );

  // Nothing in the handler threw, so there are no handler frames to report,
  // and the simulator's own are no use to whoever reads the payload. Real
  // Lambda reports a timeout without a stack at all.
  error.stack = `${error.name}: ${error.message}`;

  return error;
}
