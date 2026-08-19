import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samRecordAt, samValueList } from "../../sim-cfn-sam-record.js";

interface SamS3NotifiedBucketProperties {
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
  const configuration = samRecordAt(properties, "NotificationConfiguration");

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
          ...samValueList(configuration["LambdaConfigurations"]),
          ...notified.configurations,
        ],
      },
    },
  };
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
