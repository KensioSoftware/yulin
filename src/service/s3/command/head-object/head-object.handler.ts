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
import { SimS3NotFound } from "../../error/sim-s3.error.js";
import { GetObjectAuthorizer } from "../get-object/get-object-authorizer.js";
import { HeadObjectLoader } from "./head-object-loader.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimHeadObjectCommand,
  SimHeadObjectCommandOutput,
} from "./head-object.command.js";

interface HeadObjectCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 HeadObjectCommand handler.
 *
 * A HEAD is a read whose response stops short of the Object, so this
 * authorizes against `s3:GetObject` exactly as GetObject does. Real S3 does
 * the same, which is why a caller allowed to read an Object can also ask
 * whether it is there.
 *
 * A Bucket that does not exist and an Object that does not exist are both
 * NotFound here. A HEAD response carries no body, so a client has only the
 * status to read, and real S3 makes no distinction it could not express.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/HeadObjectCommand/
 */
export class HeadObjectCommandHandler implements CommandHandler<
  SimHeadObjectCommand,
  SimHeadObjectCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: GetObjectAuthorizer;
  private readonly loader = new HeadObjectLoader();
  private readonly background: BackgroundScheduler;

  constructor(properties: HeadObjectCommandHandlerProperties) {
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
   * Report what a read of this Object would have said about it.
   */
  async handle(
    command: SimHeadObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimHeadObjectCommandOutput> {
    assertDefined(command.input.Bucket, "HeadObjectCommand.input.Bucket");
    assertDefined(command.input.Key, "HeadObjectCommand.input.Key");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NotFound(`No S3 Bucket named ${bucketName}`);
    }

    await this.background.sequence();

    // Authorization runs before the key is looked up, so a denied caller
    // cannot learn whether an Object exists.
    this.authorizer.authorize(bucket, command.input.Key, options);

    return await this.loader.describe(
      bucket,
      command.input.Key,
      command.input.VersionId,
    );
  }
}
