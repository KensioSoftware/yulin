import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimListBucketsCommand,
  SimListBucketsCommandOutput,
} from "./list-buckets.cmd.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { ListBucketsAuthorizer } from "./list-buckets-authorizer.js";
import { ListBucketsPageBuilder } from "./list-buckets-page-builder.js";

interface ListBucketsCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListBucketsCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated S3 ListBucketsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListBucketsCommand/
 */
export class ListBucketsCommandHandler implements CommandHandler<
  SimListBucketsCommand,
  SimListBucketsCommandOutput
> {
  private readonly authorizer: ListBucketsAuthorizer;
  private readonly pageBuilder: ListBucketsPageBuilder;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListBucketsCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.authorizer = new ListBucketsAuthorizer({ iam });
    this.pageBuilder = new ListBucketsPageBuilder({ buckets });
    this.background = background;
  }

  /**
   * Simulate listing S3 Buckets.
   *
   * Authorization happens before the page builder reads Bucket state. AWS treats
   * ListBuckets as one account-level operation and does not return a partial
   * result containing only Bucket ARNs matched by the caller's policies.
   *
   * Once authorized, page construction is delegated so this handler remains
   * focused on coordinating request-level concerns.
   */
  async handle(
    command: SimListBucketsCommand,
    options?: ListBucketsCommandHandlerOptions,
  ): Promise<SimListBucketsCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(options?.caller);

    return {
      ...this.pageBuilder.build(command.input),
      $metadata: {},
    };
  }
}
