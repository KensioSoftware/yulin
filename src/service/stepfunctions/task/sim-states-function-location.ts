import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { parseSimLambdaFunctionArn } from "../../lambda/function/sim-lambda-function-arn-parts.js";
import {
  type SimLambdaFunctionReference,
  simLambdaFunctionReferenceOf,
} from "../../lambda/function/sim-lambda-function-reference.js";
import { SimStatesTaskFailure } from "../error/sim-step-functions.error.js";

/**
 * Where a function a `Task` state named is, and what it is called there.
 */
export interface SimStatesFunctionLocation {
  readonly accountId: SimAwsAccountId;
  readonly regionName: AwsRegionName;
  readonly reference: SimLambdaFunctionReference;
}

/**
 * Work out where the function a task named lives.
 *
 * An ARN carries its own Account and Region. A bare name, which the Lambda API
 * takes as well, is a function of the state machine's own Account and Region.
 */
export function simStatesFunctionLocation(
  functionNameOrArn: string,
  scope: SimAwsAccountRegionScope,
  stateName: string,
): SimStatesFunctionLocation {
  if (!functionNameOrArn.startsWith("arn:")) {
    return {
      ...scope,
      reference: simLambdaFunctionReferenceOf(functionNameOrArn),
    };
  }

  const parts = parseSimLambdaFunctionArn(functionNameOrArn);

  if (parts === undefined) {
    throw new SimStatesTaskFailure(
      `The Task state ${stateName} invokes ${functionNameOrArn}, which is ` +
        "not the ARN of a Lambda function.",
    );
  }

  return {
    accountId: parts.accountId,
    regionName: parts.regionName,
    reference: { functionName: parts.functionName, qualifier: parts.qualifier },
  };
}
