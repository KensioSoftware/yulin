import { s3BucketNotificationError } from "../../../../s3/cfn/bucket/error/sim-cfn-s3-bucket-error.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import {
  isSamTemplateRecord,
  samRecordAt,
  samValueList,
} from "../../sim-cfn-sam-record.js";

interface SamS3NotifiedBucketProperties {
  /** The logical ID of the Bucket, for a refusal to name it. */
  readonly bucketLogicalId: string;
  /** The `LambdaConfigurations` entries the event adds. */
  readonly configurations: readonly SimCfnTemplateValueRecord[];
  /** The logical ID of the permission S3 invokes the function under. */
  readonly permissionLogicalId: string;
}

/**
 * The Bucket with an event's notifications on it and the permission ahead of
 * it.
 *
 * What the Bucket already carried is kept, so a template configuring
 * notifications by hand keeps them and two events on one Bucket both arrive.
 *
 * The Bucket is made to depend on the permission, because S3 refuses a
 * destination it may not invoke and nothing else orders the two.
 */
export function samS3NotifiedBucket(
  resource: SimCfnTemplateValueRecord,
  notified: SamS3NotifiedBucketProperties,
): SimCfnTemplateValueRecord {
  const properties = samRecordAt(resource, "Properties");
  const configuration = declaredConfiguration(properties, notified);

  return {
    ...resource,
    DependsOn: [
      ...dependencies(resource["DependsOn"]),
      notified.permissionLogicalId,
    ],
    Properties: {
      ...properties,
      NotificationConfiguration: {
        ...configuration,
        LambdaConfigurations: [
          ...declaredLambdaConfigurations(configuration, notified),
          ...notified.configurations,
        ],
      },
    },
  };
}

/**
 * The `NotificationConfiguration` the Bucket already carries.
 *
 * A Bucket writing it as an intrinsic is refused rather than expanded. The
 * event's own configurations would go on the Bucket and everything the
 * intrinsic resolved to would be dropped, which is a Bucket that quietly stops
 * notifying whatever it used to.
 */
function declaredConfiguration(
  properties: SimCfnTemplateValueRecord,
  notified: SamS3NotifiedBucketProperties,
): SimCfnTemplateValueRecord {
  const declared = properties["NotificationConfiguration"];

  if (declared !== undefined && !isSamTemplateRecord(declared)) {
    throw notificationError(notified, "NotificationConfiguration");
  }

  return samRecordAt(properties, "NotificationConfiguration");
}

/**
 * The `LambdaConfigurations` the Bucket already carries, refusing one an event
 * cannot be added to.
 *
 * CloudFormation has no way to append to a list it has not resolved yet, so a
 * list written as an intrinsic is the end of it.
 */
function declaredLambdaConfigurations(
  configuration: SimCfnTemplateValueRecord,
  notified: SamS3NotifiedBucketProperties,
): readonly SimCfnTemplateValue[] {
  const declared = configuration["LambdaConfigurations"];

  if (declared !== undefined && !Array.isArray(declared)) {
    throw notificationError(notified, "LambdaConfigurations");
  }

  return samValueList(declared);
}

function notificationError(
  notified: SamS3NotifiedBucketProperties,
  propertyName: string,
): Error {
  return s3BucketNotificationError(
    notified.bucketLogicalId,
    `${propertyName} is written as an intrinsic, and an S3 event on a SAM ` +
      "function has no way to add to one CloudFormation has not resolved " +
      "yet. Declare the notification the event asks for on the Bucket " +
      "instead of stating the event",
  );
}

/**
 * The `DependsOn` a Resource carries as a list, since CloudFormation takes a
 * single logical ID in place of one.
 */
function dependencies(
  dependsOn: SimCfnTemplateValue | undefined,
): readonly SimCfnTemplateValue[] {
  return typeof dependsOn === "string" ? [dependsOn] : samValueList(dependsOn);
}
