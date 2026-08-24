import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAllowAllAuth } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimS3LifecycleConfiguration } from "../../bucket/lifecycle/sim-s3-lifecycle-configuration.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3LifecycleAuthorizer } from "../lifecycle/sim-s3-lifecycle-authorizer.js";
import { validateSimS3LifecycleRules } from "../lifecycle/sim-s3-lifecycle-rules-validation.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type {
  SimPutBucketLifecycleConfigurationCommand,
  SimPutBucketLifecycleConfigurationCommandOutput,
} from "./put-bucket-lifecycle-configuration.command.js";

interface PutBucketLifecycleConfigurationHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 PutBucketLifecycleConfigurationCommand handler.
 */
export class PutBucketLifecycleConfigurationCommandHandler implements CommandHandler<
  SimPutBucketLifecycleConfigurationCommand,
  SimPutBucketLifecycleConfigurationCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3LifecycleAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: PutBucketLifecycleConfigurationHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3LifecycleAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and replace a Bucket's lifecycle rules.
   *
   * The supplied configuration replaces the previous one wholesale, so a rule
   * it leaves out is gone rather than kept from whatever the Bucket had
   * before.
   */
  async handle(
    command: SimPutBucketLifecycleConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutBucketLifecycleConfigurationCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "PutBucketLifecycleConfigurationCommand.input.Bucket",
    );
    assertDefined(
      command.input.LifecycleConfiguration,
      "PutBucketLifecycleConfigurationCommand.input.LifecycleConfiguration",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeWrite(bucket, options);

    const configuration = command.input.LifecycleConfiguration;
    validateSimS3LifecycleRules(configuration, bucketName);

    bucket.configureLifecycle(
      SimS3LifecycleConfiguration.fromConfiguration(configuration),
    );

    return {
      $metadata: {},
    };
  }
}
