import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { jsonParse } from "../../../../util/type-guard/json.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAllowAllAuth } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamPolicyDocumentValidator } from "../../../iam/validate/sim-iam-policy-document-validator.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";
import { PutBucketPolicyAuthorizer } from "./put-bucket-policy-authorizer.js";
import type {
  SimPutBucketPolicyCommand,
  SimPutBucketPolicyCommandOutput,
} from "./put-bucket-policy.command.js";

interface PutBucketPolicyCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface PutBucketPolicyCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated S3 PutBucketPolicyCommand handler.
 */
export class PutBucketPolicyCommandHandler implements CommandHandler<
  SimPutBucketPolicyCommand,
  SimPutBucketPolicyCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: PutBucketPolicyAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly policyValidator: SimIamPolicyDocumentValidator;

  constructor(properties: PutBucketPolicyCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new PutBucketPolicyAuthorizer({ iam });
    this.background = background;
    this.policyValidator = new SimIamPolicyDocumentValidator();
  }

  /**
   * Validate, authorize, and replace a Bucket's resource policy.
   */
  async handle(
    command: SimPutBucketPolicyCommand,
    options?: PutBucketPolicyCommandHandlerOptions,
  ): Promise<SimPutBucketPolicyCommandOutput> {
    assertDefined(command.input.Bucket, "PutBucketPolicyCommand.input.Bucket");
    assertDefined(command.input.Policy, "PutBucketPolicyCommand.input.Policy");
    this.policyValidator.validateRequired(command.input.Policy);

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    await this.background.sequence();

    this.authorizer.authorize(bucketName, options?.caller);

    bucket.configurePolicy(jsonParse(command.input.Policy));

    return {
      $metadata: {},
    };
  }
}
