import type { SimLambdaPolicyResource } from "../policy/sim-lambda-policy-resource.js";
import type { SimLambdaFunction } from "../sim-lambda-function.js";

/**
 * Somewhere a request or another service delivers to: the resource it named,
 * and the version that runs.
 *
 * The two are one thing for a function and for a published version, and are
 * two for an alias. A grant made on `live` is what admits the delivery, and
 * the version `live` points at is what runs, so both travel together rather
 * than being resolved twice from either end.
 */
export interface SimLambdaFunctionTarget {
  readonly resource: SimLambdaPolicyResource;
  readonly simFunction: SimLambdaFunction;

  /**
   * The ARN the handler is told it was invoked by, where that differs from the
   * resource's. A target named with an explicit `$LATEST` is the function
   * itself, and its handler is told the ARN ending in `:$LATEST`.
   */
  readonly invokedFunctionArn?: string | undefined;
}

/**
 * Run the version a target names, telling its handler the ARN of the
 * resource the target named, which is the alias ARN for a delivery through an
 * alias.
 */
export async function simLambdaInvokeTarget(
  target: SimLambdaFunctionTarget,
  event: unknown,
): Promise<unknown> {
  const { simFunction, resource, invokedFunctionArn = resource.arn } = target;

  return await simFunction.invoke(event, invokedFunctionArn);
}
