import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimListObjectsCommand,
  SimListObjectsCommandOutput,
} from "./list-objects.cmd.js";
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
import { ListObjectsAuthorizer } from "./list-objects-authorizer.js";
import { ListObjectsPageBuilder } from "./list-objects-page-builder.js";

interface ListObjectsCommandHandlerProps {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListObjectsCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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

  constructor(props: ListObjectsCommandHandlerProps) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;

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
    cmd: SimListObjectsCommand,
    opts?: ListObjectsCommandHandlerOptions,
  ): Promise<SimListObjectsCommandOutput> {
    assertDefined(cmd.input.Bucket, "ListObjectsCommand.input.Bucket");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Complete request sequencing before authorization and storage access.
    await this.background.sequence();

    const maxKeys = cmd.input.MaxKeys ?? 1000;
    this.authorizer.authorize({
      bucket,
      prefix: cmd.input.Prefix,
      maxKeys,
      caller: opts?.caller,
    });

    return await this.pageBuilder.build({
      bucket,
      prefix: cmd.input.Prefix,
      marker: cmd.input.Marker,
      maxKeys,
    });
  }
}
