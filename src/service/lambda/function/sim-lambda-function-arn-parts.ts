import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";

/**
 * The parts of a Lambda function ARN.
 *
 * The qualifier is the version or alias a qualified ARN names, and it is
 * reported rather than ignored: simulated Lambda has neither, so a service
 * pointed at `:PROD` would otherwise reach `$LATEST` and think it had done as
 * it was told.
 */
export interface SimLambdaFunctionArnParts {
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly functionName: string;
  readonly qualifier: string | undefined;
}

/**
 * Read the parts of a Lambda function ARN, or nothing when the value is not
 * one.
 *
 * Lambda addresses a function with colons rather than a slash, so this reads
 * the ARN itself rather than going through the shared ARN parser, which is
 * built for the slash form.
 *
 * Nothing is thrown here. A function ARN reaches the simulator from another
 * service's configuration, where a value that is not one at all is an ordinary
 * case that service reports in its own words.
 */
export function parseSimLambdaFunctionArn(
  arn: string,
): SimLambdaFunctionArnParts | undefined {
  const [
    prefix,
    partition,
    service,
    region,
    accountId,
    resourceType,
    name,
    qualifier,
  ] = arn.split(":");

  if (
    prefix !== "arn" ||
    partition !== "aws" ||
    service !== "lambda" ||
    resourceType !== "function" ||
    region === undefined ||
    accountId === undefined ||
    name === undefined ||
    name === ""
  ) {
    return undefined;
  }

  return {
    regionName: region as AwsRegionName,
    accountId: accountId as SimAwsAccountId,
    functionName: name,
    qualifier,
  };
}
