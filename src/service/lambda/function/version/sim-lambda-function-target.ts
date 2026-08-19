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
}
