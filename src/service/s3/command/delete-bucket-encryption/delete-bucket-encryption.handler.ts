import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3EncryptionAuthorizer } from "../encryption/sim-s3-encryption-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimDeleteBucketEncryptionCommand,
  SimDeleteBucketEncryptionCommandOutput,
} from "./delete-bucket-encryption.command.js";

interface DeleteBucketEncryptionHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 DeleteBucketEncryptionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/DeleteBucketEncryptionCommand/
 */
export class DeleteBucketEncryptionCommandHandler implements CommandHandler<
  SimDeleteBucketEncryptionCommand,
  SimDeleteBucketEncryptionCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3EncryptionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteBucketEncryptionHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3EncryptionAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and put a Bucket back to the encryption every Bucket has.
   *
   * Real S3 leaves the Bucket SSE-S3 encrypted rather than unencrypted, and
   * the request is idempotent, so this reports nothing about what was there.
   */
  async handle(
    command: SimDeleteBucketEncryptionCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimDeleteBucketEncryptionCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "DeleteBucketEncryptionCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeWrite(bucket, options);

    bucket.deleteEncryption();

    return {
      $metadata: {},
    };
  }
}
