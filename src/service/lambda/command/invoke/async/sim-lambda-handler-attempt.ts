import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";

export type SimLambdaHandlerAttempt =
  | { readonly succeeded: true; readonly result: unknown }
  | { readonly succeeded: false; readonly error: unknown };

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

  try {
    return {
      succeeded: true,
      result: await simFunction.invoke(event, invokedFunctionArn),
    };
  } catch (error) {
    return { succeeded: false, error };
  }
}
