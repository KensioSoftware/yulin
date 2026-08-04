import type { SimAws } from "../../../../aws/sim-aws.js";
import type { SimS3NotificationDestinationRequest } from "../sim-s3-notification-destination.js";
import { SimS3NotificationQueue } from "./sim-s3-notification-queue.js";
import { SimS3NotificationQueueArn } from "./sim-s3-notification-queue-arn.js";
import type { SimS3NotificationQueues } from "./sim-s3-notification-queues.js";

interface SimAwsS3NotificationQueuesProperties {
  readonly simAws: SimAws;
}

/**
 * The simulated SQS queues of one simulated AWS instance, as S3 notification
 * destinations.
 *
 * Queues are looked up when a configuration is applied or an event is
 * delivered, never when this is built, for the same reason the Lambda
 * destination does it that way: reaching another service while this one is
 * being constructed is a cycle with no bottom to it.
 *
 * A queue in another Account is allowed, and evaluated against the IAM of the
 * Account owning it. Real S3 asks only that the queue is in the Bucket's
 * Region, which is why AWS's own documented destination queue policy carries an
 * `aws:SourceAccount` guard: it would have no job if the two Accounts were
 * always the same.
 */
export class SimAwsS3NotificationQueues implements SimS3NotificationQueues {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsS3NotificationQueuesProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Why S3 may not send to the queue, or nothing when it may.
   *
   * The Region is this side's rule and the rest is the queue's own. What S3
   * adds to the queue's decision is which Bucket is sending, so a policy
   * granting one Bucket does not open the queue to another.
   */
  sendRefusal(
    request: SimS3NotificationDestinationRequest,
  ): string | undefined {
    const arn = SimS3NotificationQueueArn.parse(request.destinationArn);

    if (!arn.isIn(request.bucketRegionName)) {
      return (
        `${request.destinationArn} is in ${arn.regionName}, and an S3 event ` +
        "notification destination queue must be in the Bucket's Region, " +
        `${request.bucketRegionName}.`
      );
    }

    return this.queue(arn).sendRefusal(request);
  }

  /**
   * Send the event document to the queue.
   */
  async send(
    request: SimS3NotificationDestinationRequest,
    body: string,
  ): Promise<void> {
    await this.queue(
      SimS3NotificationQueueArn.parse(request.destinationArn),
    ).send(request, body);
  }

  private queue(arn: SimS3NotificationQueueArn): SimS3NotificationQueue {
    return new SimS3NotificationQueue({
      arn,
      scope: this.simAws.accountRegionScope(arn.accountId, arn.regionName),
    });
  }
}
