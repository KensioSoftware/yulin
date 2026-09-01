import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaDestinationDeliveryRequest } from "../sim-lambda-destination-targets.js";

/**
 * A function a function is sending an asynchronous invocation result to, in
 * the Account and Region the destination ARN names.
 */
export class SimLambdaDestinationFunction {
  /**
   * Invoke the destination function with the record.
   */
  async deliver(
    scope: SimAwsAccountRegionContainer,
    request: SimLambdaDestinationDeliveryRequest,
  ): Promise<void> {
    const { destinationArn: arn } = request;

    await scope.lambda().invoke(
      {
        input: {
          FunctionName: arn.functionName,
          Qualifier: arn.functionQualifier,
          InvocationType: "Event",
          Payload: JSON.stringify(request.record),
        },
      },
      { caller: { kind: "arn", arn: request.sourceFunctionRoleArn } },
    );
  }
}
