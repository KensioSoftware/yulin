import { assertDefined } from "../../../../util/type-guard/defined.js";
import { requireLambdaEnvironmentVariables } from "../../function/environment/lambda-environment-variables.js";
import type { SimLambdaFunctionConfigurationUpdate } from "../../function/sim-lambda-function-reconfiguration.js";
import type { SimUpdateFunctionConfigurationCommand } from "./update-function-configuration.command.js";

/**
 * Validated UpdateFunctionConfiguration input, as a settings change the
 * function model can apply.
 *
 * The function's name comes back beside the change, because the change itself
 * says nothing about which function it is for.
 */
export interface UpdateFunctionConfigurationInput {
  readonly name: string;
  readonly update: SimLambdaFunctionConfigurationUpdate;
}

/**
 * Require the AWS-required UpdateFunctionConfiguration input fields, and
 * validate the environment variables the request declares.
 *
 * An omitted `Environment` leaves the function's variables alone. One that is
 * present replaces them, so it is validated the way CreateFunction validates
 * the same member, down to the reserved names.
 */
export function requireUpdateFunctionConfigurationInput(
  command: SimUpdateFunctionConfigurationCommand,
): UpdateFunctionConfigurationInput {
  const { input } = command;
  assertDefined(
    input.FunctionName,
    "UpdateFunctionConfigurationCommand.input.FunctionName required",
  );

  return {
    name: input.FunctionName,
    update: {
      roleArn: input.Role,
      handlerName: input.Handler,
      runtimeName: input.Runtime,
      description: input.Description,
      timeoutSeconds: input.Timeout,
      memorySizeMb: input.MemorySize,
      environmentVariables:
        input.Environment === undefined
          ? undefined
          : requireLambdaEnvironmentVariables(input.Environment),
    },
  };
}
