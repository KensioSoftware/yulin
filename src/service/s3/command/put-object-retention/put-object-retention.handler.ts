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
import { SimS3ObjectRetention } from "../../bucket/lock/sim-s3-object-retention.js";
import { SimS3ObjectLockAuthorizer } from "../object-lock/sim-s3-object-lock-authorizer.js";
import { simS3LockedVersion } from "../object-lock/sim-s3-locked-version.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimPutObjectRetentionCommand,
  SimPutObjectRetentionCommandOutput,
} from "./put-object-retention.command.js";

interface PutObjectRetentionHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 PutObjectRetentionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectRetentionCommand/
 */
export class PutObjectRetentionCommandHandler implements CommandHandler<
  SimPutObjectRetentionCommand,
  SimPutObjectRetentionCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3ObjectLockAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: PutObjectRetentionHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3ObjectLockAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and put a retention period on one version.
   *
   * Lengthening a period is always allowed. Shortening one is what the modes
   * differ over, and the version itself is what refuses it, so a template and
   * an SDK caller are held to the same rule.
   */
  async handle(
    command: SimPutObjectRetentionCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutObjectRetentionCommandOutput> {
    const { Bucket, Key, VersionId, Retention, BypassGovernanceRetention } =
      command.input;
    assertDefined(Bucket, "PutObjectRetentionCommand.input.Bucket");
    assertDefined(Key, "PutObjectRetentionCommand.input.Key");
    assertDefined(Retention, "PutObjectRetentionCommand.input.Retention");

    const bucket = requireSimS3Bucket(this.buckets, Bucket as SimS3BucketName);

    await this.background.sequence();

    this.authorizer.authorizeRetention(bucket, Key, options);
    const bypassed = this.authorizer.authorizeBypass(
      bucket,
      Key,
      BypassGovernanceRetention,
      options,
    );

    simS3LockedVersion(bucket, Key, VersionId).lock.applyRetention(
      SimS3ObjectRetention.parse(Retention),
      bypassed,
    );

    return { $metadata: {} };
  }
}
