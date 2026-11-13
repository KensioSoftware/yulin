import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import { simLambdaFunctionArn } from "../../function/sim-lambda-function-configuration.js";
import type { SimLambdaFunctionUrl } from "../../function/url/sim-lambda-function-url.js";
import type { SimLambdaFunctionUrlStore } from "../../function/url/sim-lambda-function-url-store.js";

/**
 * The Function URL of a function or one of its aliases, or fail as AWS does
 * when it has none.
 */
export function simLambdaRequireFunctionUrl(
  functionUrls: SimLambdaFunctionUrlStore,
  simFunction: SimLambdaFunction,
  qualifier: string | undefined,
): SimLambdaFunctionUrl {
  const functionUrl = functionUrls.get(simFunction.name, qualifier);

  if (functionUrl === undefined) {
    const arn = simLambdaFunctionArn(
      simFunction.accountRegionScope,
      simFunction.name,
      qualifier,
    );

    throw new SimLambdaResourceNotFoundException(
      `Function URL config not found for function: ${arn}`,
    );
  }

  return functionUrl;
}
