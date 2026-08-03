import type { SimS3NotificationDestinationRequest } from "../sim-s3-notification-destination.js";

/**
 * The narrow slice of simulated Lambda that S3 event notification needs.
 *
 * S3 asks two questions of a function: whether it may invoke it, and then to
 * invoke it. Both are asked by ARN, because a notification configuration names
 * a function by ARN and that ARN can name another Account or Region.
 */
export interface SimS3NotificationFunctions {
  /**
   * Why S3 may not invoke the function, or nothing when it may.
   *
   * A reason rather than a boolean, because both the configuration-time
   * refusal and the delivery-time record repeat it back to whoever has to fix
   * it.
   */
  invokeRefusal(
    request: SimS3NotificationDestinationRequest,
  ): string | undefined;

  /**
   * Invoke the function with an event document.
   */
  invoke(
    request: SimS3NotificationDestinationRequest,
    event: object,
  ): Promise<void>;
}
