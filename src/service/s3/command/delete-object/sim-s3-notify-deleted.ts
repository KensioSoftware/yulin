import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3ObjectDeletion } from "../../bucket/sim-s3-object-deletion.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";

interface SimS3NotifyDeletedProperties {
  readonly notifications: SimS3ObjectNotifier;
  readonly bucket: SimS3Bucket;
  readonly key: string;
  readonly caller: SimAwsResolvedCaller;
  readonly deletion: SimS3ObjectDeletion;
}

/**
 * Raise the event a delete earned, if it earned one.
 *
 * Three outcomes and three different events, which is why every delete path
 * comes through here rather than deciding for itself. A versioned Bucket wrote
 * a marker, so the event is `s3:ObjectRemoved:DeleteMarkerCreated` and carries
 * the marker's version id. A Bucket without versioning lost the Object, so it
 * is `s3:ObjectRemoved:Delete`. A delete that removed nothing raises neither,
 * because real S3 raises ObjectRemoved for an Object that was deleted rather
 * than for a request to delete one.
 */
export function simS3NotifyDeleted(
  properties: SimS3NotifyDeletedProperties,
): void {
  const { notifications, bucket, key, caller, deletion } = properties;

  if (deletion.deleteMarker !== undefined) {
    notifications.objectRemoved({
      bucket,
      key,
      caller,
      eventName: "s3:ObjectRemoved:DeleteMarkerCreated",
      versionId: deletion.deleteMarker.versionId,
    });
    return;
  }

  if (deletion.removedObject) {
    notifications.objectRemoved({
      bucket,
      key,
      caller,
      eventName: "s3:ObjectRemoved:Delete",
    });
  }
}
