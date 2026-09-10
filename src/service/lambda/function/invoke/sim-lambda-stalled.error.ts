import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";
import type { SimLambdaPendingTimer } from "./timer/sim-lambda-pending-timer.js";

/** What Yulin calls an invocation the clock is never going to release. */
const stalledErrorType = "Yulin.StalledInvocation";

interface SimLambdaStalledProperties {
  readonly awsRequestId: string;

  /** The simulated instant the clock has stopped at. */
  readonly at: Date;

  /** The timer the invocation is waiting on. */
  readonly waitingOn: SimLambdaPendingTimer;

  /** How long the host has watched simulated time stand still. */
  readonly waitedMilliseconds: number;
}

/**
 * The error an invocation gets when nothing is left that could end it.
 *
 * A handler's timers wait on the simulation's clock, and so does the
 * invocation's own deadline. Simulated time standing still holds both, and the
 * invocation would otherwise run until the test framework gave up on the test
 * around it, reporting the test rather than the timer. This names the timer
 * the handler is waiting on, the instant it is due at, and what to do about
 * it.
 */
export function simLambdaStalledError(
  properties: SimLambdaStalledProperties,
): SimLambdaRuntimeError {
  const { awsRequestId, at, waitingOn, waitedMilliseconds } = properties;
  const error = new SimLambdaRuntimeError(
    stalledErrorType,
    `${at.toISOString()} ${awsRequestId} Task is waiting on a ${waitingOn.delay} ms timer due at ${waitingOn.dueTime.toISOString()}. Simulated time has stood still for ${waitedMilliseconds} ms of host time, leaving both that timer and the invocation deadline out of reach. Advance the simulation's clock past the timer delay to release it.`,
  );

  // Nothing in the handler threw, so its frames say nothing about why the
  // invocation is stuck, and the simulator's own frames say less. The timeout
  // this stands in for is reported without a stack too.
  error.stack = `${error.name}: ${error.message}`;

  return error;
}
