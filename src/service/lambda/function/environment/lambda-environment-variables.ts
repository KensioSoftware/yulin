import { requireValidVariableNames } from "./lambda-environment-variable-names.js";
import type { SimLambdaFunctionEnvironment } from "../../command/create-function/create-function.command.js";

/**
 * Validate the Environment input into the variables declared for a function.
 */
export function requireLambdaEnvironmentVariables(
  environment: SimLambdaFunctionEnvironment | undefined,
): ReadonlyMap<string, string> {
  const variables = environment?.Variables;
  if (variables === undefined) {
    return new Map();
  }

  const declared = new Map(Object.entries(variables));
  requireValidVariableNames(declared);

  return declared;
}
