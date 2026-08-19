import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";

/**
 * The function a mapping delivers to, or nothing when it reaches none.
 *
 * A mapping created against a version or an alias resolves its qualifier on
 * every poll, so an alias moved to another version moves what the mapping
 * delivers to. A function that has gone, and a qualifier that names nothing,
 * both answer with nothing, and the poll then does nothing.
 */
export function simLambdaEventSourceFunction(
  functions: SimLambdaFunctionLookup,
  mapping: SimLambdaEventSourceMapping,
): SimLambdaFunction | undefined {
  return functions.findTarget(mapping.functionName, mapping.qualifier)
    ?.simFunction;
}
