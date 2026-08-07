import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimListObjectsCommand,
  SimListObjectsCommandOutput,
} from "./list-objects.command.js";
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
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { ListObjectsAuthorizer } from "./list-objects-authorizer.js";
import { ListObjectsPageBuilder } from "./list-objects-page-builder.js";

interface ListObjectsCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 ListObjectsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListObjectsCommand/
 */
export class ListObjectsCommandHandler implements CommandHandler<
  SimListObjectsCommand,
  SimListObjectsCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: ListObjectsAuthorizer;
  private readonly pageBuilder = new ListObjectsPageBuilder();
  private readonly background: BackgroundScheduler;

  constructor(properties: ListObjectsCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new ListObjectsAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Coordinate validation, Bucket resolution, authorization, and pagination.
   *
   * Bucket lookup occurs before authorization so missing Buckets retain their
   * existing S3 error behavior. Authorization occurs before storage listing so
   * a denied caller cannot inspect Object keys or sizes.
   */
  async handle(
    command: SimListObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimListObjectsCommandOutput> {
    assertDefined(command.input.Bucket, "ListObjectsCommand.input.Bucket");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Complete request sequencing before authorization and storage access.
    await this.background.sequence();

    const maxKeys = command.input.MaxKeys ?? 1000;
    this.authorizer.authorize({
      bucket,
      prefix: command.input.Prefix,
      maxKeys,
      options,
    });

    return await this.pageBuilder.build({
      bucket,
      prefix: command.input.Prefix,
      marker: command.input.Marker,
      maxKeys,
    });
  }
}
