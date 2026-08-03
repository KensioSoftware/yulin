import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import { DeleteObjectAuthorizer } from "./delete-object-authorizer.js";
import type {
  SimDeleteObjectCommand,
  SimDeleteObjectCommandOutput,
} from "./delete-object.command.js";

interface DeleteObjectCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeleteObjectCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated S3 DeleteObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/DeleteObjectCommand/
 */
export class DeleteObjectCommandHandler implements CommandHandler<
  SimDeleteObjectCommand,
  SimDeleteObjectCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: DeleteObjectAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteObjectCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new DeleteObjectAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and remove an Object from a Bucket.
   *
   * A missing Bucket is reported, but a missing key is not: real S3 answers a
   * deletion the same way whether or not the Object was there, so code that
   * deletes something twice sees the same success both times.
   */
  async handle(
    command: SimDeleteObjectCommand,
    options?: DeleteObjectCommandHandlerOptions,
  ): Promise<SimDeleteObjectCommandOutput> {
    assertDefined(command.input.Bucket, "DeleteObjectCommand.input.Bucket");
    assertDefined(command.input.Key, "DeleteObjectCommand.input.Key");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorize(bucket, command.input.Key, options?.caller);

    await bucket.deleteObject(command.input.Key);

    return {
      $metadata: {},
    };
  }
}
