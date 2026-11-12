import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import { parseSimLambdaFunctionArn } from "../../function/sim-lambda-function-arn-parts.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";

/**
 * The function a tagging request's `Resource` ARN names.
 *
 * A version or alias ARN is refused, because real Lambda keeps tags on the
 * function alone. An ARN naming another Account or Region names no function
 * here.
 */
export function simLambdaTaggedFunction(
  arn: string,
  scope: SimAwsAccountRegionScope,
  functions: SimLambdaFunctionLookup,
): SimLambdaFunction {
  const parts = parseSimLambdaFunctionArn(arn);

  if (parts === undefined) {
    throw new SimLambdaInvalidParameterValueException(
      `Resource ${arn} is not a Lambda function ARN. Simulated Lambda keeps ` +
        "tags on functions only",
    );
  }

  if (parts.qualifier !== undefined) {
    throw new SimLambdaInvalidParameterValueException(
      "Tags on function aliases and versions are not supported. Please " +
        "specify a function ARN.",
    );
  }

  const inScope =
    parts.accountId === scope.accountId &&
    parts.regionName === scope.regionName;
  const simFunction = inScope ? functions.find(parts.functionName) : undefined;

  if (simFunction === undefined) {
    throw new SimLambdaResourceNotFoundException(`Function not found: ${arn}`);
  }

  return simFunction;
}
