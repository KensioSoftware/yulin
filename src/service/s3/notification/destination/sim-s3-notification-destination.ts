import type { SimS3ObjectEvent } from "../event/sim-s3-object-event.js";

/**
 * What a destination needs to know about the Bucket asking it a question.
 *
 * The Bucket ARN and the owning Account are both carried because a destination
 * decides whether S3 may reach it from the resource policy on its own side, and
 * that policy is usually written for one Bucket in one Account.
 */
export interface SimS3NotificationDestinationRequest {
  readonly destinationArn: string;
  readonly bucketArn: string;
  readonly bucketOwnerAccountId: string;
}

/**
 * A destination being asked to take one event.
 */
export interface SimS3NotificationDeliveryRequest extends SimS3NotificationDestinationRequest {
  readonly configurationId: string;
  readonly event: SimS3ObjectEvent;
}

/**
 * Somewhere simulated S3 can send an Object event.
 *
 * Validation and delivery are the same per-destination question asked at two
 * moments, which is why one object owns both. Real S3 checks the destination
 * when the configuration is applied and checks it again for every event, so a
 * permission removed afterwards stops delivery rather than being remembered
 * from configuration time.
 */
export interface SimS3NotificationDestination {
  /**
   * Refuse a destination the Bucket cannot notify, when the configuration
   * naming it is applied.
   */
  validate(request: SimS3NotificationDestinationRequest): void;

  /**
   * Deliver one event, refusing if the destination no longer admits S3.
   */
  deliver(request: SimS3NotificationDeliveryRequest): Promise<void>;
}

/**
 * The destinations one simulated S3 scope can reach.
 */
export interface SimS3NotificationDestinations {
  /**
   * The destination an ARN names, refusing an ARN S3 cannot notify.
   */
  resolve(destinationArn: string): SimS3NotificationDestination;
}
