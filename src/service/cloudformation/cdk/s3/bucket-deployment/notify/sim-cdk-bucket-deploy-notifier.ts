import type { SimAwsResolvedCaller } from "../../../../../aws/caller/sim-aws-caller-resolver.js";
import { makeSimAwsAccountRootPrincipal } from "../../../../../aws/caller/sim-aws-account-root-principal.js";
import { simAwsResolvedCallerOf } from "../../../../../aws/caller/sim-aws-resolved-caller.js";
import type { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import type { SimS3ObjectDeletion } from "../../../../../s3/bucket/sim-s3-object-deletion.js";
import { simS3NotifyDeleted } from "../../../../../s3/command/delete-object/sim-s3-notify-deleted.js";
import type { SimS3ObjectNotifier } from "../../../../../s3/notification/sim-s3-object-notifier.js";
import type { SimS3Object } from "../../../../../s3/object/s3-object.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../../resource/sim-cfn-resource.js";

interface SimCdkBucketDeployNotifierProperties {
  readonly bucket: SimS3Bucket;
  readonly notifications: SimS3ObjectNotifier;
  readonly caller: SimAwsResolvedCaller;
}

/**
 * Raises the S3 Object events a deployment into a Bucket earns.
 *
 * A deployment writes Objects rather than sending S3 commands, so it says here
 * what a command would have said for it. Real CDK runs a provider function
 * that syncs the staged asset into the Bucket, one PutObject per file and one
 * DeleteObject per Object the sync deletes, and a Bucket with a notification
 * configuration hears all of them.
 */
export class SimCdkBucketDeployNotifier {
  private readonly bucket: SimS3Bucket;
  private readonly notifications: SimS3ObjectNotifier;
  private readonly caller: SimAwsResolvedCaller;

  constructor(properties: SimCdkBucketDeployNotifierProperties) {
    this.bucket = properties.bucket;
    this.notifications = properties.notifications;
    this.caller = properties.caller;
  }

  /**
   * Say that the deployment wrote an Object.
   */
  deployed(object: SimS3Object, versionId: string | undefined): void {
    this.notifications.objectCreated({
      bucket: this.bucket,
      object,
      caller: this.caller,
      eventName: "s3:ObjectCreated:Put",
      versionId,
    });
  }

  /**
   * Say that the deployment pruned a key, as far as the delete got.
   *
   * A pruning deployment deletes rather than removes. A versioned Bucket keeps
   * what it held behind a marker, and the event says so. That is the same
   * three-way answer a DeleteObject command gets, so the same reading of it
   * serves here.
   */
  pruned(key: string, deletion: SimS3ObjectDeletion): void {
    simS3NotifyDeleted({
      notifications: this.notifications,
      bucket: this.bucket,
      key,
      caller: this.caller,
      deletion,
    });
  }
}

/**
 * The notifier for one deployment, reaching the Bucket's own simulated S3.
 *
 * The events are attributed to the Account root rather than to the deployment's
 * caller. Real S3 names the identity that wrote the Object, which for a CDK
 * BucketDeployment is the provider function's execution role, and neither that
 * function nor its role is simulated. Root is what simulated AWS attributes an
 * unstated caller to everywhere else.
 */
export function simCdkBucketDeployNotifier(
  resource: SimCfnResource,
  bucket: SimS3Bucket,
  context: SimCloudFormationResourceCreateContext,
): SimCdkBucketDeployNotifier {
  const { accountId, regionName } = resource.accountRegionScope;

  return new SimCdkBucketDeployNotifier({
    bucket,
    notifications: context.simAws
      .accountRegionScope(accountId, regionName)
      .s3()
      .objectNotifier(),
    caller: simAwsResolvedCallerOf(makeSimAwsAccountRootPrincipal(accountId)),
  });
}
