import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  requireLambdaCodeSource,
  type SimLambdaCodeSource,
} from "../../function/code/lambda-code-source.js";
import { requireLambdaEnvironmentVariables } from "../../function/environment/lambda-environment-variables.js";
import type { SimCreateFunctionCommand } from "./create-function.command.js";

/**
 * Validated CreateFunction input, in sim Lambda function model terms.
 */
export interface CreateFunctionInput {
  name: string;
  roleArn: string;
  codeSource: SimLambdaCodeSource;
  handlerName: string | undefined;
  runtimeName: string | undefined;
  description: string | undefined;
  timeoutSeconds: number | undefined;
  memorySizeMb: number | undefined;
  environmentVariables: ReadonlyMap<string, string>;
}

/**
 * Require the AWS-required CreateFunction input fields, and validate the
 * function code input into a sim Lambda code source.
 */
export function requireCreateFunctionInput(
  command: SimCreateFunctionCommand,
): CreateFunctionInput {
  const { input } = command;
  assertDefined(
    input.FunctionName,
    "CreateFunctionCommand.input.FunctionName required",
  );
  assertDefined(input.Role, "CreateFunctionCommand.input.Role required");

  return {
    name: input.FunctionName,
    roleArn: input.Role,
    codeSource: requireLambdaCodeSource(input.Code),
    handlerName: input.Handler,
    runtimeName: input.Runtime,
    description: input.Description,
    timeoutSeconds: input.Timeout,
    memorySizeMb: input.MemorySize,
    environmentVariables: requireLambdaEnvironmentVariables(input.Environment),
  };
}
