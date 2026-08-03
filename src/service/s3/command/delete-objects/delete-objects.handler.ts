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
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import { DeleteObjectsKeyRemoval } from "./delete-objects-key-removal.js";
import { DeleteObjectsOutcome } from "./delete-objects-outcome.js";
import { DeleteObjectsRequest } from "./delete-objects-request.js";
import type {
  SimDeleteObjectsCommand,
  SimDeleteObjectsCommandOutput,
} from "./delete-objects.command.js";

interface DeleteObjectsCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly notifications: SimS3ObjectNotifier;
}

interface DeleteObjectsCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated S3 DeleteObjectsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/DeleteObjectsCommand/
 */
export class DeleteObjectsCommandHandler implements CommandHandler<
  SimDeleteObjectsCommand,
  SimDeleteObjectsCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly background: BackgroundScheduler;
  private readonly removal: DeleteObjectsKeyRemoval;

  constructor(properties: DeleteObjectsCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.background = background;
    this.removal = new DeleteObjectsKeyRemoval({
      iam,
      notifications: properties.notifications,
    });
  }

  /**
   * Authorize and remove each Object the request names.
   *
   * A key the caller may not remove is reported in the response while the rest
   * of the batch is still deleted.
   */
  async handle(
    command: SimDeleteObjectsCommand,
    options?: DeleteObjectsCommandHandlerOptions,
  ): Promise<SimDeleteObjectsCommandOutput> {
    assertDefined(command.input.Bucket, "DeleteObjectsCommand.input.Bucket");
    assertDefined(command.input.Delete, "DeleteObjectsCommand.input.Delete");

    const request = new DeleteObjectsRequest(command.input.Delete);
    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    const attempts = await Promise.all(
      request.keys.map(
        async (key) => await this.removal.remove(bucket, key, options?.caller),
      ),
    );

    return new DeleteObjectsOutcome(attempts).toOutput(request.quiet);
  }
}
