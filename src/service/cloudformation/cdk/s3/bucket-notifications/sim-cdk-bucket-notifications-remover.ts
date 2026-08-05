import type {
  SimCfnResource,
  SimCloudFormationResourceDeleteContext,
} from "../../../resource/sim-cfn-resource.js";
import { bucketNotificationsError } from "./error/sim-cdk-bucket-notification-error.js";
import { SimCdkBucketNotificationProperties } from "./property/sim-cdk-bucket-notification-properties.js";

/**
 * Removes the notification configuration a Custom::S3BucketNotifications
 * Resource put on a Bucket.
 *
 * The CDK provider function empties the configuration on its Delete event, and
 * an empty PutBucketNotificationConfiguration is how that is said in the SDK,
 * so that is the call made here.
 *
 * The Bucket itself is deleted after this, because the Resource names the
 * Bucket and so comes down first.
 */
export class SimCdkBucketNotificationsRemover {
  /**
   * Put an empty notification configuration back on the Resource's Bucket.
   */
  async remove(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    /* v8 ignore if -- defensive catch; the resolver routes on this name */
    if (resourceTypeName !== "S3BucketNotifications") {
      throw bucketNotificationsError(
        resource.logicalId,
        `${resourceTypeName} is not a Resource type this factory deletes`,
      );
    }

    const properties = new SimCdkBucketNotificationProperties(
      resource.logicalId,
      context.resolvedProperties ?? resource.properties,
    );

    await context.simAws
      .accountRegionScope(
        resource.accountRegionScope.accountId,
        resource.accountRegionScope.regionName,
      )
      .s3()
      .putBucketNotificationConfiguration({
        input: {
          Bucket: properties.bucketName,
          NotificationConfiguration: {},
        },
      });
  }
}
