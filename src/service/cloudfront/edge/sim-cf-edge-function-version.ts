import type { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaFunctionArnParts } from "../../lambda/function/sim-lambda-function-arn-parts.js";
import type { SimLambdaFunctionTarget } from "../../lambda/function/version/sim-lambda-function-target.js";

/**
 * The simulated Lambda function version a Lambda@Edge association names.
 *
 * A `LambdaFunctionARN` can name any Account, so the version is looked up in
 * the scope its own ARN names rather than in CloudFront's. Nothing is thrown
 * here: a caller that refuses an absent function says so in its own words, and
 * a Distribution deployed from a template deploys without the association
 * instead.
 */
export function findSimCfEdgeFunctionVersion(
  simAws: SimAws,
  arn: SimLambdaFunctionArnParts,
): SimLambdaFunctionTarget | undefined {
  return simAws
    .accountRegionScope(arn.accountId, arn.regionName)
    .lambda()
    .getSimFunctionTarget(arn.functionName, arn.qualifier);
}
