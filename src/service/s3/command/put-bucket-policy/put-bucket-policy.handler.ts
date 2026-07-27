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
import { SimS3PublicPolicyGuard } from "../../bucket/public-access/sim-s3-public-policy-guard.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
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
  private readonly publicPolicyGuard = new SimS3PublicPolicyGuard();

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
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorize(bucketName, options?.caller);

    const document = jsonParse(command.input.Policy);

    this.publicPolicyGuard.guard(bucket, document);

    bucket.configurePolicy(document);

    return {
      $metadata: {},
    };
  }
}
