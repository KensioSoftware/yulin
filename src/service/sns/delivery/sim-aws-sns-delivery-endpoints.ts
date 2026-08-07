import type { SimAws } from "../../aws/sim-aws.js";
import { SimAwsSnsDeliveryFunctions } from "./lambda/sim-aws-sns-delivery-functions.js";
import { SimSnsProtocolDeliveryEndpoints } from "./sim-sns-protocol-delivery-endpoints.js";
import { SimAwsSnsDeliveryQueues } from "./sqs/sim-aws-sns-delivery-queues.js";

interface SimAwsSnsDeliveryEndpointsProperties {
  readonly simAws: SimAws;
}

/**
 * Everywhere the topics of one simulated AWS instance can deliver.
 *
 * Which protocols are simulated is a fact about simulated SNS rather than about
 * the service builder that hands it its endpoints, so the set is assembled
 * here.
 */
export class SimAwsSnsDeliveryEndpoints extends SimSnsProtocolDeliveryEndpoints {
  constructor(properties: SimAwsSnsDeliveryEndpointsProperties) {
    super({
      byProtocol: {
        sqs: new SimAwsSnsDeliveryQueues(properties),
        lambda: new SimAwsSnsDeliveryFunctions(properties),
      },
    });
  }
}
