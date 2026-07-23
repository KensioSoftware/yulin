import { assertDefined } from "../../../../util/type-guard/defined.js";
import { LambdaZipFileExtractor } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../function/sim-lambda-handler.type.js";
import type { SimCreateFunctionCommand } from "./create-function.cmd.js";

/**
 * Validated CreateFunction input, in sim Lambda function model terms.
 */
export interface CreateFunctionInput {
  name: string;
  roleArn: string;
  handlerFunction: SimLambdaHandler;
  handlerName: string | undefined;
  runtimeName: string | undefined;
  description: string | undefined;
  timeoutSeconds: number | undefined;
  memorySizeMb: number | undefined;
}

/**
 * Require the AWS-required CreateFunction input fields, and extract the
 * handler function reference from the function code input.
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
  assertDefined(
    input.Code?.ZipFile,
    "CreateFunctionCommand.input.Code.ZipFile required",
  );

  const extractor = new LambdaZipFileExtractor(input.Code.ZipFile);

  return {
    name: input.FunctionName,
    roleArn: input.Role,
    handlerFunction: extractor.extractHandlerFunction(),
    handlerName: input.Handler,
    runtimeName: input.Runtime,
    description: input.Description,
    timeoutSeconds: input.Timeout,
    memorySizeMb: input.MemorySize,
  };
}
