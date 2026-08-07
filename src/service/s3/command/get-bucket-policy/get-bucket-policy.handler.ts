import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAllowAllAuth } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3NoSuchBucketPolicy } from "../../error/sim-s3.error.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import { GetBucketPolicyAuthorizer } from "./get-bucket-policy-authorizer.js";
import type {
  SimGetBucketPolicyCommand,
  SimGetBucketPolicyCommandOutput,
} from "./get-bucket-policy.command.js";

interface GetBucketPolicyCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 GetBucketPolicyCommand handler.
 */
export class GetBucketPolicyCommandHandler implements CommandHandler<
  SimGetBucketPolicyCommand,
  SimGetBucketPolicyCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: GetBucketPolicyAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetBucketPolicyCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new GetBucketPolicyAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and return a Bucket's resource policy.
   */
  async handle(
    command: SimGetBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetBucketPolicyCommandOutput> {
    assertDefined(command.input.Bucket, "GetBucketPolicyCommand.input.Bucket");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorize(bucket, options);

    const policy = bucket.getPolicy();
    if (policy === undefined) {
      throw new SimS3NoSuchBucketPolicy(
        `No Bucket policy on S3 Bucket ${bucketName}`,
      );
    }

    return {
      Policy: jsonStringify(policy),
      $metadata: {},
    };
  }
}
