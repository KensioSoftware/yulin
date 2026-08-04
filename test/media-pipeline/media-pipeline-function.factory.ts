import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { makeLambdaCodeZip } from "../../src/service/lambda/function/code/make-lambda-code-zip.js";
import type { SimLambdaFunction } from "../../src/service/lambda/function/sim-lambda-function.js";

/**
 * What one step of the pipeline asks for when it wants a function.
 *
 * The variables are pairs rather than object keys because the AWS-shaped upper
 * case names are not the shape this project's own identifiers take.
 */
export interface MediaPipelineFunctionInput {
  readonly functionName: string;
  readonly roleArn: string;
  /** CommonJS source, packaged as the archive's `index.js`. */
  readonly code: string;
  readonly variables: readonly (readonly [string, string])[];
}

/**
 * Creates one zip-packaged function of the pipeline, running as the execution
 * role it is given.
 *
 * ```typescript
 * const screener = await mediaPipelineFunctionFactory.make(
 *   { functionName: "screen-upload", roleArn, code: screenUploadCode },
 *   simAws,
 * );
 * ```
 *
 * The code runs in the vm runtime, so it reaches simulated AWS through the
 * runtime-provided SDK as its execution role, which is what makes the role
 * worth giving it.
 */
export const mediaPipelineFunctionFactory = new AsyncMappedFactory<
  MediaPipelineFunctionInput,
  SimLambdaFunction,
  SimAws
>(
  () => ({
    functionName: "pipeline-step",
    roleArn: "arn:aws:iam::111111111111:role/PipelineRole",
    code: "exports.handler = async () => undefined;",
    variables: [],
  }),
  async (input, simAws) => {
    const simLambda = simAws.lambda();

    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: input.functionName,
        Role: input.roleArn,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Environment: { Variables: Object.fromEntries(input.variables) },
        Code: { ZipFile: makeLambdaCodeZip(input.code) },
      }),
    );

    const created = simLambda.getSimFunctionByName(input.functionName);
    assertNonNullable(created, `Simulated Lambda holds ${input.functionName}`);

    return created;
  },
);
