import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import { SimS3ObjectLockAuthorizer } from "../object-lock/sim-s3-object-lock-authorizer.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type { SimDeleteObjectCommandOutput } from "./delete-object.command.js";

interface DeleteObjectVersionRemovalProperties {
  readonly notifications: SimS3ObjectNotifier;
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * One request to remove one named version.
 */
export interface SimS3VersionRemoval {
  readonly bucket: SimS3Bucket;
  readonly key: string;
  readonly versionId: string;
  readonly caller: SimAwsResolvedCaller;
  readonly bypassGovernance: boolean | undefined;
  readonly options: SimS3RequestOptions | undefined;
}

/**
 * Removes one named version of a key for good.
 *
 * Separate from the request-level delete because the two answer differently.
 * A delete without a version id writes a marker over the current version and
 * leaves the bytes where they are. This one takes a version away, and only
 * this one can leave a key with nothing under it on a versioned Bucket. It is
 * also the only one Object Lock has anything to say about.
 */
export class DeleteObjectVersionRemoval {
  private readonly notifications: SimS3ObjectNotifier;
  private readonly objectLock: SimS3ObjectLockAuthorizer;

  constructor(properties: DeleteObjectVersionRemovalProperties) {
    this.notifications = properties.notifications;
    this.objectLock = new SimS3ObjectLockAuthorizer({ iam: properties.iam });
  }

  /**
   * Remove the named version, reporting what went.
   *
   * Real S3 answers a version that was never there the same way it answers one
   * it removed, so a version id nothing matches is reported back rather than
   * raised. Removing a delete marker is reported as such, which is how a
   * caller undoing a delete knows the marker was what went.
   *
   * A version Object Lock is holding is refused with `AccessDenied` before
   * anything is removed. Naming `BypassGovernanceRetention` gets past a
   * governance period, and needs `s3:BypassGovernanceRetention` as well as the
   * `s3:DeleteObject` the request already needed.
   */
  async remove(
    request: SimS3VersionRemoval,
  ): Promise<SimDeleteObjectCommandOutput> {
    const { bucket, key, versionId, caller } = request;

    const bypassed = this.objectLock.authorizeBypass(
      bucket,
      key,
      request.bypassGovernance,
      request.options,
    );

    const removed = await bucket.deleteObjectVersion(key, versionId, bypassed);

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
