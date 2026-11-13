import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";

export type SimLambdaHandlerAttempt =
  | { readonly succeeded: true; readonly result: unknown }
  | {
      readonly succeeded: false;
      readonly error: unknown;

      /** Whether the function's reserved concurrency turned this attempt away. */
      readonly throttled: boolean;
    };

/**
 * Invoke a function handler while keeping its error separate from later
 * destination delivery errors.
 */
export async function simLambdaHandlerAttempt(invocation: {
  readonly simFunction: SimLambdaFunction;
  readonly event: unknown;
  readonly invokedFunctionArn: string;
}): Promise<SimLambdaHandlerAttempt> {
  const { simFunction, event, invokedFunctionArn } = invocation;
  const refusalsBefore = simFunction.concurrency.refusals;
  const running = simFunction.invoke(event, invokedFunctionArn);
  // Read straight after starting: the reservation turns an invocation away
  // before anything awaits, so a refusal counted here is this attempt's.
  const throttled = simFunction.concurrency.refusals > refusalsBefore;

  try {
    return { succeeded: true, result: await running };
  } catch (error) {
    return { succeeded: false, error, throttled };
  }
}
