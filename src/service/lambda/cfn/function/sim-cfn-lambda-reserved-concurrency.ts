import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambda } from "../../sim-lambda.js";
import type { SimCfnLambdaFunctionProperties } from "./sim-cfn-lambda-function-properties-parser.js";

/**
 * Reserve the concurrency an AWS::Lambda::Function states, once the function
 * exists.
 *
 * CloudFormation sets `ReservedConcurrentExecutions` with
 * PutFunctionConcurrency after creating the function, so the reservation is
 * authorized and limited as that request is. A function stating none is left
 * unreserved.
 */
export async function simCfnLambdaReserveConcurrency(
  lambda: SimLambda,
  functionProperties: SimCfnLambdaFunctionProperties,
  options?: SimCfnResourceCallerOptions,
): Promise<void> {
  const { functionName, reservedConcurrentExecutions } = functionProperties;

  if (reservedConcurrentExecutions === undefined) {
    return;
  }

  await lambda.putFunctionConcurrency(
    {
      input: {
        FunctionName: functionName,
        ReservedConcurrentExecutions: reservedConcurrentExecutions,
      },
    },
    options,
  );
}

/**
 * Finish creating a template function once CreateFunction has made it, by
 * reserving the concurrency it states, and answer with the function.
 */
export async function simCfnLambdaCreatedFunction(
  lambda: SimLambda,
  functionProperties: SimCfnLambdaFunctionProperties,
  options?: SimCfnResourceCallerOptions,
): Promise<SimLambdaFunction> {
  await simCfnLambdaReserveConcurrency(lambda, functionProperties, options);

  const simFunction = lambda.getSimFunctionByName(
    functionProperties.functionName,
  );
  assertDefined(
    simFunction,
    `Sim Lambda function ${functionProperties.functionName} after CloudFormation creation`,
  );

  return simFunction;
}
