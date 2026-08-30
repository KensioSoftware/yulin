import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import { DeleteObjectAuthorizer } from "../delete-object/delete-object-authorizer.js";
import { DeleteObjectAttempt } from "./delete-object-attempt.js";
import { simS3NotifyDeleted } from "../delete-object/sim-s3-notify-deleted.js";

interface DeleteObjectsKeyRemovalProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly notifications: SimS3ObjectNotifier;
}

/**
 * Removes one key of a batch deletion.
 *
 * A batch carries on past a key it could not remove, so what happened to each
 * key travels with the key rather than being raised. Each key is authorized on
 * its own against `s3:DeleteObject`, and raises its own event notification, as
 * real S3 does.
 */
export class DeleteObjectsKeyRemoval {
  private readonly authorizer: DeleteObjectAuthorizer;
  private readonly notifications: SimS3ObjectNotifier;

  constructor(properties: DeleteObjectsKeyRemovalProperties) {
    this.authorizer = new DeleteObjectAuthorizer({ iam: properties.iam });
    this.notifications = properties.notifications;
  }

  /**
   * Authorize and remove one key, reporting what came of it.
   */
  async remove(
    bucket: SimS3Bucket,
    key: string,
    options?: SimS3RequestOptions,
  ): Promise<DeleteObjectAttempt> {
    try {
      const resolvedCaller = this.authorizer.authorize(bucket, key, options);
      const deletion = await bucket.deleteObject(key);

      simS3NotifyDeleted({
        notifications: this.notifications,
        bucket,
        key,
        caller: resolvedCaller,
        deletion,
      });

      return new DeleteObjectAttempt(key, undefined, deletion.deleteMarker);
    } catch (error) {
      return new DeleteObjectAttempt(key, error);
    }
  }
}
