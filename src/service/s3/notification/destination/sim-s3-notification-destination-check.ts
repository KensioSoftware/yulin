import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3NotificationConfiguration } from "../../bucket/notification/sim-s3-notification-configuration.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3NotificationDestinations } from "./sim-s3-notification-destination.js";

/**
 * Checks that a Bucket can actually reach the destinations a configuration
 * names.
 *
 * Real S3 validates the destinations as part of the call that applies the
 * configuration, so a function that does not allow `s3.amazonaws.com` to invoke
 * it is refused there rather than accepted and never delivered to.
 */
export class SimS3NotificationDestinationCheck {
  private readonly destinations: SimS3NotificationDestinations;

  constructor(destinations: SimS3NotificationDestinations) {
    this.destinations = destinations;
  }

  /**
   * Refuse a configuration naming a destination this Bucket cannot notify.
   */
  check(
    bucket: SimS3Bucket,
    configuration: SimS3NotificationConfiguration,
  ): void {
    const scope = bucket.getAccountRegionScope();
    const request = {
      bucketArn: simS3BucketArn(bucket.bucketName),
      bucketOwnerAccountId: scope.accountId,
      bucketRegionName: scope.regionName,
    };

    for (const notification of configuration.all) {
      this.destinations
        .resolve(notification.destinationService, notification.destinationArn)
        .validate({ ...request, destinationArn: notification.destinationArn });
    }
  }
}
