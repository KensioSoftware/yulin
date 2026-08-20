import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaDestinationArn } from "../sim-lambda-destination-arn.js";

/**
 * One document on its way to one queue or topic.
 */
export interface SimLambdaDestinationSend {
  readonly scope: SimAwsAccountRegionContainer;
  readonly arn: SimLambdaDestinationArn;
  readonly body: string;

  /**
   * The function this came from, supplied to IAM as `aws:SourceArn`.
   */
  readonly sourceFunctionArn: string;
}
