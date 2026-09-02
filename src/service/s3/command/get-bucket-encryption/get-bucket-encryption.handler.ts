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
  SimGetBucketEncryptionCommand,
  SimGetBucketEncryptionCommandOutput,
} from "./get-bucket-encryption.command.js";

interface GetBucketEncryptionHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 GetBucketEncryptionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetBucketEncryptionCommand/
 */
export class GetBucketEncryptionCommandHandler implements CommandHandler<
  SimGetBucketEncryptionCommand,
  SimGetBucketEncryptionCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3EncryptionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetBucketEncryptionHandlerProperties) {
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
   * Authorize and report a Bucket's default encryption.
   *
   * A Bucket nobody has configured answers with the SSE-S3 rule rather than an
   * error, which is what real S3 has answered since it began encrypting every
   * Bucket by default.
   */
  async handle(
    command: SimGetBucketEncryptionCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetBucketEncryptionCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "GetBucketEncryptionCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeRead(bucket, options);

    return {
      ServerSideEncryptionConfiguration: bucket.getEncryption().configuration,
      $metadata: {},
    };
  }
}
