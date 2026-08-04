import type { SimS3NotificationDestinationRequest } from "../sim-s3-notification-destination.js";

/**
 * The narrow slice of simulated SQS that S3 event notification needs.
 *
 * S3 asks two questions of a queue: whether it may send to it, and then to send
 * to it. Both are asked by ARN, because a notification configuration names a
 * queue by ARN and that ARN can name another Account.
 */
export interface SimS3NotificationQueues {
  /**
   * Why S3 may not send to the queue, or nothing when it may.
   *
   * A reason rather than a boolean, because both the configuration-time
   * refusal and the delivery-time record repeat it back to whoever has to fix
   * it.
   */
  sendRefusal(request: SimS3NotificationDestinationRequest): string | undefined;

  /**
   * Send one message body to the queue.
   */
  send(
    request: SimS3NotificationDestinationRequest,
    body: string,
  ): Promise<void>;
}
