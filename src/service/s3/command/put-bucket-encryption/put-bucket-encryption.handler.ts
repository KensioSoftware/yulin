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
import { SimS3BucketEncryption } from "../../bucket/encryption/sim-s3-bucket-encryption.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3EncryptionAuthorizer } from "../encryption/sim-s3-encryption-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimPutBucketEncryptionCommand,
  SimPutBucketEncryptionCommandOutput,
} from "./put-bucket-encryption.command.js";

interface PutBucketEncryptionHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 PutBucketEncryptionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutBucketEncryptionCommand/
 */
export class PutBucketEncryptionCommandHandler implements CommandHandler<
  SimPutBucketEncryptionCommand,
  SimPutBucketEncryptionCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3EncryptionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: PutBucketEncryptionHandlerProperties) {
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
   * Authorize and apply a Bucket's default encryption.
   *
   * The configuration decides the algorithm an Object written without one is
   * stamped with. Objects already in the Bucket keep what they were written
   * with, as they do in real S3.
   */
  async handle(
    command: SimPutBucketEncryptionCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutBucketEncryptionCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "PutBucketEncryptionCommand.input.Bucket",
    );
    assertDefined(
      command.input.ServerSideEncryptionConfiguration,
      "PutBucketEncryptionCommand.input.ServerSideEncryptionConfiguration",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeWrite(bucket, options);

    bucket.configureEncryption(
      SimS3BucketEncryption.fromConfiguration(
        command.input.ServerSideEncryptionConfiguration,
        bucketName,
      ),
    );

    return {
      $metadata: {},
    };
  }
}
