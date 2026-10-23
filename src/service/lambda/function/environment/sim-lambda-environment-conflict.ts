import type { SimLambdaEnvironment } from "./sim-lambda-environment.js";

/**
 * A difference between declared values that matters once the name is read
 * outside an invocation.
 *
 * The key says which kind of difference it is and for which name, and is
 * what a warning is printed once for.
 */
export interface SimLambdaEnvironmentConflict {
  readonly key: string;
  readonly name: string;
  readonly message: string;
}

/**
 * The advice that follows each warning, given the name that was read early.
 */
function moveTheReadAdvice(name: string): string {
  return (
    `Code read process.env.${name} outside any invocation, as a read at ` +
    "module scope does when the module is imported, and saw the host value " +
    "instead. Move the read inside the handler function."
  );
}

/**
 * The conflict of a function declaring a name the host process also sets,
 * with a different value.
 */
export function simLambdaHostConflict(
  environment: SimLambdaEnvironment,
  name: string,
): SimLambdaEnvironmentConflict {
  return {
    key: `host:${name}`,
    name,
    message:
      `Sim Lambda function "${environment.functionName}" declares ` +
      `environment variable ${name}, which the host process also sets ` +
      `with a different value. ${moveTheReadAdvice(name)}`,
  };
}

/**
 * The conflict of two functions declaring different values for one name.
 */
export function simLambdaFunctionConflict(
  existing: SimLambdaEnvironment,
  environment: SimLambdaEnvironment,
  name: string,
): SimLambdaEnvironmentConflict {
  return {
    key: `function:${name}`,
    name,
    message:
      `Sim Lambda functions "${existing.functionName}" and ` +
      `"${environment.functionName}" declare different values for ` +
      `environment variable ${name}. ${moveTheReadAdvice(name)}`,
  };
}
