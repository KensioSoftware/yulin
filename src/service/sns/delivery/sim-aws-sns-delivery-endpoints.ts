import type { SimAws } from "../../aws/sim-aws.js";
import { SimAwsSnsDeliveryFunctions } from "./lambda/sim-aws-sns-delivery-functions.js";
import type { SimSnsOutwardDeliveryEndpoints } from "./sim-sns-protocol-delivery-endpoints.js";
import { SimAwsSnsDeliveryQueues } from "./sqs/sim-aws-sns-delivery-queues.js";

interface SimAwsSnsDeliveryEndpointsProperties {
  readonly simAws: SimAws;
}

/**
 * Everywhere outside itself the topics of one simulated AWS instance deliver.
 *
 * Which protocols are simulated is a fact about simulated SNS rather than about
 * the service builder that hands it its endpoints, so the set is assembled
 * here. The `sms` protocol is not one of them: an SMS never leaves simulated
 * SNS, which fills that one in itself.
 */
export function simAwsSnsDeliveryEndpoints(
  properties: SimAwsSnsDeliveryEndpointsProperties,
): SimSnsOutwardDeliveryEndpoints {
  return {
    sqs: new SimAwsSnsDeliveryQueues(properties),
    lambda: new SimAwsSnsDeliveryFunctions(properties),
  };
}
