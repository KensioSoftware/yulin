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
import { SimS3NoSuchKey } from "../../error/sim-s3.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { GetObjectAuthorizer } from "./get-object-authorizer.js";
import { GetObjectLoader } from "./get-object-loader.js";

interface GetObjectCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
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
   *
   * A stated `Range` reaches the loader with the key, since which bytes of an
   * Object a caller may read is not something IAM decides.
   *
   * A key holding nothing goes back to authorization before the absence is
   * reported. Real S3 tells a caller that a key is missing only where it may
   * list the Bucket, and answers AccessDenied otherwise.
   */
  async handle(
    command: SimGetObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetObjectCommandOutput> {
    assertDefined(command.input.Bucket, "GetObjectCommand.input.Bucket");
    assertDefined(command.input.Key, "GetObjectCommand.input.Key");

    const bucket = requireSimS3Bucket(
      this.buckets,
      command.input.Bucket as SimS3BucketName,
    );

    // Complete request sequencing before authorization and storage access.
    await this.background.sequence();

    this.authorizer.authorize(bucket, command.input.Key, options);

    const output = await this.loader.load(
      bucket,
      command.input.Key,
      command.input.Range,
      command.input.VersionId,
    );

    if (output !== undefined) {
      return output;
    }

    this.authorizer.authorizeMissingKey(bucket, options);

    throw new SimS3NoSuchKey(`No S3 Object named ${command.input.Key}`);
  }
}
