import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import type { SimDeleteObjectCommandOutput } from "./delete-object.command.js";

interface DeleteObjectVersionRemovalProperties {
  readonly notifications: SimS3ObjectNotifier;
}

/**
 * Removes one named version of a key for good.
 *
 * Separate from the request-level delete because the two answer differently.
 * A delete without a version id writes a marker over the current version and
 * leaves the bytes where they are. This one takes a version away, and only
 * this one can leave a key with nothing under it on a versioned Bucket.
 */
export class DeleteObjectVersionRemoval {
  private readonly notifications: SimS3ObjectNotifier;

  constructor(properties: DeleteObjectVersionRemovalProperties) {
    this.notifications = properties.notifications;
  }

  /**
   * Remove the named version, reporting what went.
   *
   * Real S3 answers a version that was never there the same way it answers one
   * it removed, so a version id nothing matches is reported back rather than
   * raised. Removing a delete marker is reported as such, which is how a
   * caller undoing a delete knows the marker was what went.
   */
  async remove(
    bucket: SimS3Bucket,
    key: string,
    versionId: string,
    caller: SimAwsResolvedCaller,
  ): Promise<SimDeleteObjectCommandOutput> {
    const removed = await bucket.deleteObjectVersion(key, versionId);

    if (removed !== undefined && !removed.isDeleteMarker) {
      this.notifications.objectRemoved({
        bucket,
        key,
        caller,
        eventName: "s3:ObjectRemoved:Delete",
        // A Bucket keeping no versions raises a record without one, as real S3
        // does, even where the request named the null version to get here.
        ...(bucket.getVersions().keepsVersions && { versionId }),
      });
    }

    return {
      ...(removed?.isDeleteMarker === true && { DeleteMarker: true }),
      VersionId: versionId,
      $metadata: {},
    };
  }
}
