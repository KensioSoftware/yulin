import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";

export interface ParsedHandlerName {
  readonly modulePath: string;
  readonly exportName: string;
}

/**
 * Parse an AWS Lambda handler identifier such as "index.handler" or
 * "src/app.handler" into its module path and export name.
 *
 * The separator is the last period rather than the first, so a module in a
 * directory and a module with a period in its name both resolve the way real
 * Lambda resolves them: `src/app.service.handler` is the `handler` export of
 * `src/app.service`.
 */
export function parseLambdaHandlerName(handlerName: string): ParsedHandlerName {
  const separator = handlerName.lastIndexOf(".");

  if (separator <= 0 || separator === handlerName.length - 1) {
    throw new SimLambdaRuntimeError(
      "Runtime.MalformedHandlerName",
      `Bad handler '${handlerName}': expected format 'file.method'`,
    );
  }

  return {
    modulePath: handlerName.slice(0, separator),
    exportName: handlerName.slice(separator + 1),
  };
}
