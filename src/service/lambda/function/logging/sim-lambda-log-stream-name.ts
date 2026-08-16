import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";

/**
 * The log group a Lambda function writes to.
 *
 * Real Lambda derives it from the function name, and so does the value the
 * runtime puts in `context.logGroupName`.
 */
export function simLambdaLogGroupName(functionName: string): string {
  return `/aws/lambda/${functionName}`;
}

/**
 * The name of the log stream one execution environment writes to.
 *
 * Real Lambda names it `YYYY/MM/DD/[$LATEST]<32 hex characters>`, dated by
 * when the environment started rather than by the invocation, which is why a
 * long-lived environment keeps writing to yesterday's stream. The date comes
 * from the simulation's clock so a test that froze time gets the date it set.
 *
 * The hex part identifies the execution environment, not the request. A test
 * asserting on a stream name should match the shape rather than the value, as
 * it would have to against a real account.
 */
export function simLambdaLogStreamName(clock: SimClock): string {
  const started = clock.now();
  const year = started.getUTCFullYear();
  const month = String(started.getUTCMonth() + 1).padStart(2, "0");
  const day = String(started.getUTCDate()).padStart(2, "0");

  return `${year}/${month}/${day}/[$LATEST]${randomUUID().replaceAll("-", "")}`;
}
