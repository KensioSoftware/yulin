import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import { DeleteObjectAuthorizer } from "./delete-object-authorizer.js";
import { DeleteObjectVersionRemoval } from "./delete-object-version-removal.js";
import { simS3NotifyDeleted } from "./sim-s3-notify-deleted.js";
import type {
  SimDeleteObjectCommand,
  SimDeleteObjectCommandOutput,
} from "./delete-object.command.js";

interface DeleteObjectCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly notifications: SimS3ObjectNotifier;
}

/**
 * Simulated S3 DeleteObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/DeleteObjectCommand/
 */
export class DeleteObjectCommandHandler implements CommandHandler<
  SimDeleteObjectCommand,
  SimDeleteObjectCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: DeleteObjectAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly notifications: SimS3ObjectNotifier;
  private readonly versionRemoval: DeleteObjectVersionRemoval;

  constructor(properties: DeleteObjectCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new DeleteObjectAuthorizer({ iam });
    this.background = background;
    this.notifications = properties.notifications;
    this.versionRemoval = new DeleteObjectVersionRemoval({
      notifications: properties.notifications,
      iam,
    });
  }

  /**
   * Authorize and remove an Object from a Bucket.
   *
   * A missing Bucket is reported, but a missing key is not. Real S3 answers a
   * deletion the same way whether or not the Object was there, so code that
   * deletes something twice sees the same success both times.
   *
   * A `VersionId` asks for that one version and removes it for good. A request
   * without one asks for the current version, which a versioned Bucket answers
   * by writing a delete marker over it. Object Lock holds a named version and
   * never the marker, since a marker hides an Object without losing it.
   */
  async handle(
    command: SimDeleteObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimDeleteObjectCommandOutput> {
    const { Bucket, Key, VersionId, BypassGovernanceRetention } = command.input;
    assertDefined(Bucket, "DeleteObjectCommand.input.Bucket");
    assertDefined(Key, "DeleteObjectCommand.input.Key");

    const bucket = requireSimS3Bucket(this.buckets, Bucket as SimS3BucketName);

    await this.background.sequence();

    const caller = this.authorizer.authorize(bucket, Key, options);

    if (VersionId !== undefined) {
      return await this.versionRemoval.remove({
        bucket,
        key: Key,
        versionId: VersionId,
        caller,
        bypassGovernance: BypassGovernanceRetention,
        options,
      });
    }

    const deletion = await bucket.deleteObject(Key);
    const notifications = this.notifications;

    simS3NotifyDeleted({ notifications, bucket, key: Key, caller, deletion });

    return { ...deletion.reported, $metadata: {} };
  }
}
