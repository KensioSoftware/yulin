import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";

export type SimLambdaHandlerAttempt =
  | { readonly succeeded: true; readonly result: unknown }
  | { readonly succeeded: false; readonly error: unknown };

/**
 * Invoke a function handler while keeping its error separate from later
 * destination delivery errors.
 */
export async function simLambdaHandlerAttempt(
  simFunction: SimLambdaFunction,
  event: unknown,
): Promise<SimLambdaHandlerAttempt> {
  try {
    return { succeeded: true, result: await simFunction.invoke(event) };
  } catch (error) {
    return { succeeded: false, error };
  }
}
