import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  type SimLambdaCodeInputNaming,
  requireLambdaCodeSource,
  type SimLambdaCodeSource,
} from "../../function/code/lambda-code-source.js";
import type { SimUpdateFunctionCodeCommand } from "./update-function-code.command.js";

/**
 * Where UpdateFunctionCode carries its code members, which is the top level
 * of its input.
 */
const updateFunctionCodeNaming: SimLambdaCodeInputNaming = {
  path: "UpdateFunctionCodeCommand.input",
  memberPrefix: "",
};

/**
 * Validated UpdateFunctionCode input, in sim Lambda function model terms.
 */
export interface UpdateFunctionCodeInput {
  name: string;
  codeSource: SimLambdaCodeSource;
  publish: boolean;
}

/**
 * Require the AWS-required UpdateFunctionCode input fields, and validate the
 * function code input into a sim Lambda code source.
 */
export function requireUpdateFunctionCodeInput(
  command: SimUpdateFunctionCodeCommand,
): UpdateFunctionCodeInput {
  const { input } = command;
  assertDefined(
    input.FunctionName,
    "UpdateFunctionCodeCommand.input.FunctionName required",
  );

  return {
    name: input.FunctionName,
    codeSource: requireLambdaCodeSource(
      {
        ZipFile: input.ZipFile,
        S3Bucket: input.S3Bucket,
        S3Key: input.S3Key,
        S3ObjectVersion: input.S3ObjectVersion,
        ImageUri: input.ImageUri,
      },
      updateFunctionCodeNaming,
    ),
    publish: input.Publish ?? false,
  };
}
