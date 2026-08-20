import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaDestinationDeliveryRequest } from "../sim-lambda-destination-targets.js";

/**
 * An event bus a function is sending an asynchronous invocation result to, in
 * the Account and Region the destination ARN names.
 *
 * Real Lambda puts the record in the detail of an event of its own, under the
 * detail type that says whether the invocation succeeded.
 */
export class SimLambdaDestinationBus {
  /**
   * Put the record on the bus as one event.
   */
  async deliver(
    scope: SimAwsAccountRegionContainer,
    request: SimLambdaDestinationDeliveryRequest,
  ): Promise<void> {
    const outcome =
      request.record.requestContext.condition === "Success"
        ? "Success"
        : "Failure";

    await scope.eventBridge().putEvents({
      input: {
        Entries: [
          {
            Source: "lambda",
            DetailType: `Lambda Function Invocation Result - ${outcome}`,
            Detail: JSON.stringify(request.record),
            EventBusName: request.destinationArn.eventBusName,
            Resources: [request.sourceFunctionArn],
          },
        ],
      },
    });
  }
}
