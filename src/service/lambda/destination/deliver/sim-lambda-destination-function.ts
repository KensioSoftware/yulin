import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import { SimLambdaError } from "../../error/sim-lambda.error.js";
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
    const target = scope
      .lambda()
      .getSimFunctionTarget(arn.functionName, arn.functionQualifier);

    if (target === undefined) {
      throw new SimLambdaError(
        `${arn.value} is not a simulated Lambda function.`,
      );
    }

    // Invoked directly rather than through an Invoke command, because this is
    // already inside the background task standing for the asynchronous
    // invocation, and because a delivery failure has to reach the caller who
    // advanced the clock rather than being swallowed a second time.
    await target.simFunction.invoke(request.record);
  }
}
