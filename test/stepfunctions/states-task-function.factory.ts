import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { AwsRegionName } from "../../src/service/aws/sim-aws-region.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaFunction } from "../../src/service/lambda/function/sim-lambda-function.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";

/**
 * What a `Task` state test asks for when it wants a function to invoke.
 */
export interface StatesTaskFunctionInput {
  readonly functionName: string;

  /**
   * The handler, which runs in this process and reads the simulation's clock.
   */
  readonly handler: SimLambdaHandler;

  /**
   * The Region the function lives in, which is the default one unless a test
   * is about a task reaching across Regions.
   */
  readonly regionName: AwsRegionName | undefined;
}

/**
 * Creates a simulated Lambda function for a `Task` state to invoke, answering
 * with the function so a test can read its ARN.
 *
 * ```typescript
 * const check = await statesTaskFunctionFactory.make(
 *   { functionName: "check-enrolment", handler: () => ({ eligible: true }) },
 *   simAws,
 * );
 * ```
 *
 * The function is active by the time this answers, so a state machine can
 * invoke it straight away.
 */
export const statesTaskFunctionFactory = new AsyncMappedFactory<
  StatesTaskFunctionInput,
  SimLambdaFunction,
  SimAws
>(
  () => ({
    functionName: "check-enrolment",
    handler: (event: unknown): unknown => event,
    regionName: undefined,
  }),
  async (input, simAws) => {
    const simLambda = simAws.region(input.regionName).lambda();

    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: input.functionName,
        Role: "arn:aws:iam::123456789012:role/FunctionRole",
        Code: { ZipFile: makeLambdaZipFileInput(input.handler) },
      }),
    );

    // Creation schedules activation, and a caller asking for a function is
    // asking for one a task can invoke.
    await simAws.backgroundTasksComplete();

    const created = simLambda.getSimFunctionByName(input.functionName);
    assertNonNullable(created, `Simulated Lambda holds ${input.functionName}`);

    return created;
  },
);
