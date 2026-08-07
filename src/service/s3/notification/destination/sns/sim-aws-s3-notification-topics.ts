import type { SimAws } from "../../../../aws/sim-aws.js";
import type { SimS3NotificationDestinationRequest } from "../sim-s3-notification-destination.js";
import { SimS3NotificationTopic } from "./sim-s3-notification-topic.js";
import { SimS3NotificationTopicArn } from "./sim-s3-notification-topic-arn.js";
import type { SimS3NotificationTopics } from "./sim-s3-notification-topics.js";

interface SimAwsS3NotificationTopicsProperties {
  readonly simAws: SimAws;
}

/**
 * The simulated SNS topics of one simulated AWS instance, as S3 notification
 * destinations.
 *
 * Topics are looked up when a configuration is applied or an event is
 * delivered, never when this is built, for the same reason the other
 * destinations do it that way: reaching another service while this one is being
 * constructed is a cycle with no bottom to it.
 *
 * A topic in another Account is allowed, and evaluated against the IAM of the
 * Account owning it. Real S3 asks only that the topic is in the Bucket's
 * Region, the same rule it applies to a destination queue.
 */
export class SimAwsS3NotificationTopics implements SimS3NotificationTopics {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsS3NotificationTopicsProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Why S3 may not publish to the topic, or nothing when it may.
   *
   * The Region is this side's rule and the rest is the topic's own. What S3
   * adds to the topic's decision is which Bucket is sending, so a policy
   * granting one Bucket does not open the topic to another.
   */
  publishRefusal(
    request: SimS3NotificationDestinationRequest,
  ): string | undefined {
    const arn = SimS3NotificationTopicArn.parse(request.destinationArn);

    if (!arn.isIn(request.bucketRegionName)) {
      return (
        `${request.destinationArn} is in ${arn.regionName}, and an S3 event ` +
        "notification destination topic must be in the Bucket's Region, " +
        `${request.bucketRegionName}.`
      );
    }

    return this.topic(arn).publishRefusal(request);
  }

  /**
   * Publish the event document to the topic.
   */
  async publish(
    request: SimS3NotificationDestinationRequest,
    body: string,
  ): Promise<void> {
    await this.topic(
      SimS3NotificationTopicArn.parse(request.destinationArn),
    ).publish(request, body);
  }

  private topic(arn: SimS3NotificationTopicArn): SimS3NotificationTopic {
    return new SimS3NotificationTopic({
      arn,
      scope: this.simAws.accountRegionScope(arn.accountId, arn.regionName),
    });
  }
}
