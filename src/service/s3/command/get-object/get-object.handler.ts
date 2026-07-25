import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimGetObjectCommand,
  SimGetObjectCommandOutput,
} from "./get-object.command.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { GetObjectAuthorizer } from "./get-object-authorizer.js";
import { GetObjectLoader } from "./get-object-loader.js";

interface GetObjectCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface GetObjectCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated S3 GetObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectCommand/
 */
export class GetObjectCommandHandler implements CommandHandler<
  SimGetObjectCommand,
  SimGetObjectCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: GetObjectAuthorizer;
  private readonly loader = new GetObjectLoader();
  private readonly background: BackgroundScheduler;

  constructor(properties: GetObjectCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.buckets = buckets;
    this.authorizer = new GetObjectAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Coordinate validation, Bucket resolution, authorization, and Object loading.
   *
   * The order of these stages is significant:
   *
   * - validation reports malformed requests before service processing;
   * - Bucket resolution preserves the existing NoSuchBucket behavior;
   * - authorization occurs before key lookup so denied callers cannot determine
   *   whether an Object exists;
   * - the loader performs storage access only after authorization succeeds.
   */
  async handle(
    command: SimGetObjectCommand,
    options?: GetObjectCommandHandlerOptions,
  ): Promise<SimGetObjectCommandOutput> {
    assertDefined(command.input.Bucket, "GetObjectCommand.input.Bucket");
    assertDefined(command.input.Key, "GetObjectCommand.input.Key");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Complete request sequencing before authorization and storage access.
    await this.background.sequence();

    this.authorizer.authorize(bucket, command.input.Key, options?.caller);

    return await this.loader.load(bucket, command.input.Key);
  }
}
