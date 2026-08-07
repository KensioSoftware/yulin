import type { SimCfnServiceResourceFactory } from "../../../resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../../resource/sim-cfn-resource.js";
import { SimCdkBucketNotificationConfiguration } from "./configuration/sim-cdk-bucket-notification-configuration.js";
import { bucketNotificationsError } from "./error/sim-cdk-bucket-notification-error.js";
import { SimCdkBucketNotificationProperties } from "./property/sim-cdk-bucket-notification-properties.js";
import { SimCdkBucketNotificationsRemover } from "./sim-cdk-bucket-notifications-remover.js";

/**
 * CloudFormation Resource factory for CDK Bucket event notifications.
 *
 * CDK never emits the `AWS::S3::Bucket` `NotificationConfiguration` property.
 * Every `bucket.addEventNotification(...)` becomes a
 * `Custom::S3BucketNotifications` Resource backed by a Python provider function
 * whose only job is one PutBucketNotificationConfiguration call. The Resource
 * therefore already carries the SDK request shape, and this factory makes that
 * call through the ordinary command path, so a CDK app and an SDK caller are
 * validated identically.
 *
 * `ServiceToken` is read for the provider function it names, and otherwise
 * ignored. That function is declined on its runtime, as CDK's BucketDeployment
 * provider is, and recorded as inert rather than as a gap, since this factory
 * has already made the call it would have made.
 */
export class SimCdkBucketNotificationsResourceFactory implements SimCfnServiceResourceFactory {
  /**
   * Apply a CDK Bucket notification configuration to the simulated Bucket.
   *
   * Nothing is returned as the Resource's simulated object. A notification
   * configuration has no existence of its own in S3, so there is nothing for
   * `Ref` or `Fn::GetAtt` to answer with, and CDK references neither.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<undefined> {
    /* v8 ignore if -- defensive catch; the resolver routes on this name */
    if (resourceTypeName !== "S3BucketNotifications") {
      throw bucketNotificationsError(
        resource.logicalId,
        `${resourceTypeName} is not a Resource type this factory creates`,
      );
    }

    const properties = new SimCdkBucketNotificationProperties(
      resource.logicalId,
      context.resolvedProperties ?? resource.properties,
    );
    properties.assertManaged();

    const configuration = new SimCdkBucketNotificationConfiguration(
      resource.logicalId,
    ).read(properties.notificationConfiguration);

    await context.simAws
      .accountRegionScope(
        resource.accountRegionScope.accountId,
        resource.accountRegionScope.regionName,
      )
      .s3()
      .putBucketNotificationConfiguration({
        input: {
          Bucket: properties.bucketName,
          NotificationConfiguration: configuration,
          SkipDestinationValidation: properties.skipDestinationValidation,
        },
      });

    return undefined;
  }

  /**
   * Take the Bucket's notification configuration back off again.
   *
   * The CDK provider function does the same on its Delete event: the
   * configuration it put on is the configuration it removes, by putting an
   * empty one back.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await new SimCdkBucketNotificationsRemover().remove(
      resourceTypeName,
      resource,
      context,
    );
  }
}
