import type { SimAws } from "../../../aws/sim-aws.js";
import { SimSnsFunctionEndpointArn } from "../../subscription/sim-sns-function-endpoint-arn.js";
import type {
  SimSnsDeliveryEndpoints,
  SimSnsDeliveryRequest,
} from "../sim-sns-delivery.js";
import { SimSnsDeliveryFunction } from "./sim-sns-delivery-function.js";

interface SimAwsSnsDeliveryFunctionsProperties {
  readonly simAws: SimAws;
}

/**
 * The simulated Lambda functions of one simulated AWS instance, as places a
 * topic delivers to.
 *
 * The function is looked up when a message is delivered, never when this is
 * built, for the same reason the delivery queues do it that way: reaching
 * another service while this one is being constructed is a cycle with no bottom
 * to it.
 *
 * A function in another Account or another Region is allowed, since real SNS
 * invokes both.
 */
export class SimAwsSnsDeliveryFunctions implements SimSnsDeliveryEndpoints {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsSnsDeliveryFunctionsProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Deliver one message to the function its subscription's endpoint names.
   */
  async deliver(request: SimSnsDeliveryRequest): Promise<void> {
    const arn = SimSnsFunctionEndpointArn.parse(
      request.subscription.endpoint.value,
    );

    await new SimSnsDeliveryFunction({
      arn,
      scope: this.simAws.accountRegionScope(arn.accountId, arn.regionName),
    }).deliver(request);
  }
}
