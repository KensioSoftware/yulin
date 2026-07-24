import { SimLambdaRuntimeError } from "../../../error/sim-lambda-runtime.error.js";

/**
 * Build the AWS-like Runtime.UserCodeSyntaxError for a module that failed to
 * compile, with a CommonJS hint when the source looks like an ES module.
 */
export function userCodeSyntaxError(
  filePath: string,
  error: unknown,
): SimLambdaRuntimeError {
  let message = String(error);
  if (error instanceof Error) {
    message = error.message;
  }

  if (message.includes("import statement") || message.includes("'export'")) {
    message +=
      "; sim Lambda only supports CommonJS function code so far - " +
      "use exports.handler = ... instead of ES module syntax";
  }

  return new SimLambdaRuntimeError(
    "Runtime.UserCodeSyntaxError",
    `Syntax error in ${filePath}: ${message}`,
  );
}
