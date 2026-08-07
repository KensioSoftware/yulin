import type { SimS3NotificationDestinationRequest } from "../sim-s3-notification-destination.js";

/**
 * The narrow slice of simulated SNS that S3 event notification needs.
 *
 * S3 asks two questions of a topic: whether it may publish to it, and then to
 * publish to it. Both are asked by ARN, because a notification configuration
 * names a topic by ARN and that ARN can name another Account.
 */
export interface SimS3NotificationTopics {
  /**
   * Why S3 may not publish to the topic, or nothing when it may.
   *
   * A reason rather than a boolean, because both the configuration-time refusal
   * and the delivery-time record repeat it back to whoever has to fix it.
   */
  publishRefusal(
    request: SimS3NotificationDestinationRequest,
  ): string | undefined;

  /**
   * Publish one message body to the topic.
   */
  publish(
    request: SimS3NotificationDestinationRequest,
    body: string,
  ): Promise<void>;
}
