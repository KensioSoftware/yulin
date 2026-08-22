import {
  parseSimLambdaFunctionArn,
  type SimLambdaFunctionArnParts,
} from "../../lambda/function/sim-lambda-function-arn-parts.js";
import { SimCloudFrontInvalidLambdaFunctionAssociation } from "../error/sim-cloudfront.error.js";

/**
 * The only Region CloudFront runs a Lambda@Edge function from.
 */
export const lambdaEdgeRegion = "us-east-1";

/**
 * Read the parts of a Lambda@Edge function ARN, refusing one CloudFront would
 * refuse.
 *
 * These are the two mistakes that get made, and both are refused at
 * association time in AWS rather than showing up as a function that never
 * runs. A function has to live in us-east-1 wherever the rest of the stack
 * lives, and it has to be named by a published version. `$LATEST` moves under
 * the Distribution and an alias can be repointed, so CloudFront takes neither
 * and takes no unqualified ARN either.
 */
export function edgeFunctionArnParts(
  functionArn: string,
): SimLambdaFunctionArnParts {
  const arn = parseSimLambdaFunctionArn(functionArn);

  if (arn === undefined) {
    throw new SimCloudFrontInvalidLambdaFunctionAssociation(
      `Sim CloudFront LambdaFunctionARN ${functionArn} is not a Lambda function ARN`,
    );
  }

  if (arn.regionName !== lambdaEdgeRegion) {
    throw new SimCloudFrontInvalidLambdaFunctionAssociation(
      `Sim CloudFront Lambda@Edge function ${functionArn} is in ` +
        `${arn.regionName}, but CloudFront only runs Lambda@Edge functions ` +
        `from ${lambdaEdgeRegion}`,
    );
  }

  assertVersionQualifier(arn, functionArn);

  return arn;
}

/**
 * Refuse an ARN naming anything but a published version.
 *
 * A version qualifier is a number, and an alias is a name, which is the whole
 * of the difference between the two in an ARN.
 */
function assertVersionQualifier(
  arn: SimLambdaFunctionArnParts,
  functionArn: string,
): void {
  const { qualifier } = arn;

  if (qualifier !== undefined && /^\d+$/u.test(qualifier)) {
    return;
  }

  throw new SimCloudFrontInvalidLambdaFunctionAssociation(
    `Sim CloudFront LambdaFunctionARN ${functionArn} does not name a ` +
      `published Lambda function version. CloudFront needs a version ` +
      `qualifier such as :1, and takes neither $LATEST nor an alias. ` +
      `Publish a version with PublishVersion or AWS::Lambda::Version.`,
  );
}
