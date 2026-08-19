import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimLogsSubscriptionDestinations } from "../sim-logs-subscription-destinations.js";
import {
  simLogsSubscriptionEventPayload,
  type SimLogsSubscriptionDelivery,
} from "../sim-logs-subscription-event.js";
import { permittedSimLogsDestinationFunction } from "./sim-logs-destination-permission.js";
import { SimLogsSubscriptionFunctionArn } from "./sim-logs-subscription-function-arn.js";

interface SimAwsLogsSubscriptionFunctionsProperties {
  readonly simAws: SimAws;

  /** The Account and Region the subscribed log groups are in. */
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The simulated Lambda functions of one simulated AWS instance, as places a
 * subscription filter delivers to.
 *
 * The function is looked up when an event is delivered, and again when a
 * filter is put, never when this is built: reaching simulated Lambda while
 * simulated CloudWatch Logs is being constructed would be a cycle with no
 * bottom to it, since every Lambda function records its output here.
 */
export class SimAwsLogsSubscriptionFunctions implements SimLogsSubscriptionDestinations {
  readonly #simAws: SimAws;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsLogsSubscriptionFunctionsProperties) {
    this.#simAws = properties.simAws;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Check the destination function is there and admits CloudWatch Logs.
   */
  async check(destinationArn: string): Promise<void> {
    this.permitted(destinationArn);

    await Promise.resolve();
  }

  /**
   * Deliver matched events to the destination function.
   */
  async deliver(
    destinationArn: string,
    delivery: SimLogsSubscriptionDelivery,
  ): Promise<void> {
    // Invoked directly rather than through an Invoke command, because this is
    // already inside the background task that stands for the asynchronous
    // delivery real CloudWatch Logs makes, and because a handler failure has
    // to reach the delivery outcome rather than being swallowed.
    await this.permitted(destinationArn).simFunction.invoke(
      simLogsSubscriptionEventPayload(delivery),
    );
  }

  private permitted(
    destinationArn: string,
  ): ReturnType<typeof permittedSimLogsDestinationFunction> {
    const arn = SimLogsSubscriptionFunctionArn.parse(
      destinationArn,
      this.#accountRegionScope,
    );

    return permittedSimLogsDestinationFunction(
      arn,
      this.#simAws.accountRegionScope(arn.accountId, arn.regionName),
    );
  }
}
