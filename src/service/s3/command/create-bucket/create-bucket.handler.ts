import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput,
} from "./create-bucket.command.js";
import { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimS3GlobalRegistry } from "../../sim-s3-global-registry.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { SimS3BucketNameAvailability } from "../../bucket/name-availability/sim-s3-bucket-name-availability.js";
import { validateS3BucketName } from "../../bucket/validate/validate-s3-bucket-name.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3ConditionContext } from "../authorize/sim-s3-condition-context.js";

interface CreateBucketCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly buckets: Map<string, SimS3Bucket>;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * S3 CreateBucketCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CreateBucketCommand/
 */
export class CreateBucketCommandHandler implements CommandHandler<
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly buckets: Map<string, SimS3Bucket>;
  private readonly s3GlobalRegistry: SimS3GlobalRegistry;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;

  constructor(properties: CreateBucketCommandHandlerProperties) {
    const {
      accountRegionScope,
      buckets,
      s3GlobalRegistry,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.accountRegionScope = accountRegionScope;
    this.buckets = buckets;
    this.s3GlobalRegistry = s3GlobalRegistry;
    this.iam = iam;
    this.background = background;
  }

  /**
   * Handle creation of a new S3 Bucket.
   */
  async handle(
    command: SimCreateBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimCreateBucketCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "CreateBucketCommand.input.Bucket required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const bucketName = command.input.Bucket;
    validateS3BucketName(bucketName);

    const resource = `arn:aws:s3:::${bucketName}`;
    const decision = this.iam.authorize({
      action: "s3:CreateBucket",
      resource,
      caller: options?.caller,
      conditionContext: simS3ConditionContext(options),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: "s3:CreateBucket",
        resource,
      });
    }

    const simS3BucketNameAvailability = new SimS3BucketNameAvailability({
      accountRegionScope: this.accountRegionScope,
      buckets: this.buckets,
      s3GlobalRegistry: this.s3GlobalRegistry,
    });
    simS3BucketNameAvailability.ensureCanCreateBucketNamed(bucketName);

    const bucket = new SimS3Bucket({
      bucketName,
      accountRegionScope: this.accountRegionScope,
      clock: this.background,
    });
    this.buckets.set(bucketName, bucket);
    this.s3GlobalRegistry.registerBucket(bucketName, this.accountRegionScope);

    return {
      BucketArn: resource,
      Location: `/${bucketName}`,
      $metadata: {},
    };
  }
}
