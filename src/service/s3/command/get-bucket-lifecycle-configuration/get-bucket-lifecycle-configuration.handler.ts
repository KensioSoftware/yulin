import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAllowAllAuth } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3NoSuchLifecycleConfiguration } from "../../error/sim-s3.error.js";
import { SimS3LifecycleAuthorizer } from "../lifecycle/sim-s3-lifecycle-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type {
  SimGetBucketLifecycleConfigurationCommand,
  SimGetBucketLifecycleConfigurationCommandOutput,
} from "./get-bucket-lifecycle-configuration.command.js";

interface GetBucketLifecycleConfigurationHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 GetBucketLifecycleConfigurationCommand handler.
 */
export class GetBucketLifecycleConfigurationCommandHandler implements CommandHandler<
  SimGetBucketLifecycleConfigurationCommand,
  SimGetBucketLifecycleConfigurationCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3LifecycleAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetBucketLifecycleConfigurationHandlerProperties) {
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
   * Authorize and return a Bucket's lifecycle rules.
   *
   * A Bucket carrying no rules is reported as NoSuchLifecycleConfiguration
   * rather than an empty list, which is how real S3 separates a Bucket nobody
   * configured from one configured to do nothing.
   */
  async handle(
    command: SimGetBucketLifecycleConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetBucketLifecycleConfigurationCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "GetBucketLifecycleConfigurationCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeRead(bucket, options);

    const lifecycle = bucket.getLifecycle();
    if (lifecycle.isEmpty) {
      throw new SimS3NoSuchLifecycleConfiguration(
        `No lifecycle configuration on S3 Bucket ${bucketName}`,
      );
    }

    return {
      Rules: lifecycle.rules,
      $metadata: {},
    };
  }
}
