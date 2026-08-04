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

  /**
   * The Region the Bucket is in, which a queue destination has to be in too.
   *
   * A Bucket ARN carries no Region, so it is passed alongside rather than read
   * out of one.
   */
  readonly bucketRegionName: string;
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
 * The kinds of destination a notification configuration can name.
 *
 * Which one a configuration wants comes from the destination group it was
 * declared in rather than from the service segment of its ARN, so a queue ARN
 * under `LambdaFunctionConfigurations` is refused for not being a function
 * rather than quietly delivered to as a queue.
 */
export type SimS3NotificationDestinationService = "lambda" | "sqs";

/**
 * The destinations one simulated S3 scope can reach.
 */
export interface SimS3NotificationDestinations {
  /**
   * The destination of a kind, refusing one this simulated S3 cannot reach.
   *
   * The ARN is carried for the refusal to name rather than to be read.
   */
  resolve(
    service: SimS3NotificationDestinationService,
    destinationArn: string,
  ): SimS3NotificationDestination;
}
