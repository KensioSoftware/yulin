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
import { SimS3ObjectLockAuthorizer } from "../object-lock/sim-s3-object-lock-authorizer.js";
import { simS3LockedVersion } from "../object-lock/sim-s3-locked-version.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimPutObjectLegalHoldCommand,
  SimPutObjectLegalHoldCommandOutput,
} from "./put-object-legal-hold.command.js";

interface PutObjectLegalHoldHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 PutObjectLegalHoldCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectLegalHoldCommand/
 */
export class PutObjectLegalHoldCommandHandler implements CommandHandler<
  SimPutObjectLegalHoldCommand,
  SimPutObjectLegalHoldCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3ObjectLockAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: PutObjectLegalHoldHandlerProperties) {
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
   * Authorize and turn the legal hold on one version on or off.
   *
   * A hold goes on and comes off through the same request and the same
   * permission. There is no bypass and no period to wait out, which is what
   * makes a hold the thing to reach for when the end of the retention is not
   * knowable in advance.
   */
  async handle(
    command: SimPutObjectLegalHoldCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutObjectLegalHoldCommandOutput> {
    const { Bucket, Key, VersionId, LegalHold } = command.input;
    assertDefined(Bucket, "PutObjectLegalHoldCommand.input.Bucket");
    assertDefined(Key, "PutObjectLegalHoldCommand.input.Key");
    assertDefined(LegalHold, "PutObjectLegalHoldCommand.input.LegalHold");

    const bucket = requireSimS3Bucket(this.buckets, Bucket as SimS3BucketName);

    await this.background.sequence();

    this.authorizer.authorizeLegalHold(bucket, Key, options);

    simS3LockedVersion(bucket, Key, VersionId).lock.applyLegalHold(LegalHold);

    return { $metadata: {} };
  }
}
