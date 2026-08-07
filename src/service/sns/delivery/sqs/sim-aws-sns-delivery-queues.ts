import type { SimAws } from "../../../aws/sim-aws.js";
import { SimSnsUnsimulatedInputException } from "../../error/sim-sns.error.js";
import { SimSnsQueueEndpointArn } from "../../subscription/sim-sns-queue-endpoint-arn.js";
import type {
  SimSnsDeliveryEndpoints,
  SimSnsDeliveryRequest,
} from "../sim-sns-delivery.js";
import { SimSnsDeliveryQueue } from "./sim-sns-delivery-queue.js";

interface SimAwsSnsDeliveryQueuesProperties {
  readonly simAws: SimAws;
}

/**
 * The simulated SQS queues of one simulated AWS instance, as places a topic
 * delivers to.
 *
 * The queue is looked up when a message is delivered, never when this is
 * built, for the same reason S3's notification destinations do it that way:
 * reaching another service while this one is being constructed is a cycle with
 * no bottom to it.
 *
 * A queue in another Account or another Region is allowed. Real SNS delivers to
 * both, which is a deliberate difference from simulated S3 event notifications:
 * real S3 requires the destination queue to be in the Bucket's Region, and real
 * SNS does not.
 */
export class SimAwsSnsDeliveryQueues implements SimSnsDeliveryEndpoints {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsSnsDeliveryQueuesProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Deliver one message to the queue its subscription's endpoint names.
   */
  async deliver(request: SimSnsDeliveryRequest): Promise<void> {
    const arn = SimSnsQueueEndpointArn.parse(request.endpointArn);

    await new SimSnsDeliveryQueue({
      arn,
      scope: this.simAws.accountRegionScope(arn.accountId, arn.regionName),
    }).deliver(request);
  }
}

/**
 * The endpoints a simulated SNS built on its own can reach, which is none.
 *
 * A standalone SimSns has no other simulated services to reach, and owns its
 * own background scheduler, so nothing could wait for a delivery it made even
 * if it could make one. Subscriptions still work, since holding them takes
 * nothing but SNS: it is delivery that is refused, and the refusal is recorded
 * as a delivery failure like any other.
 */
export class SimSnsNoDeliveryEndpoints implements SimSnsDeliveryEndpoints {
  /**
   * Refuse every delivery, explaining how to get one.
   */
  deliver(request: SimSnsDeliveryRequest): never {
    throw new SimSnsUnsimulatedInputException(
      `Cannot deliver to ${request.endpointArn}: this SimSns was constructed ` +
        "on its own, so it has no other simulated services to deliver to and " +
        "no shared background scheduler to deliver on. Reach simulated SNS " +
        "through SimAws to deliver a published message to a queue.",
    );
  }
}
