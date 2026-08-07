import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAllowAllAuth } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimS3PublicAccessBlock } from "../../bucket/public-access/sim-s3-public-access-block.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3PublicAccessBlockAuthorizer } from "../public-access-block/sim-s3-public-access-block-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type {
  SimPutPublicAccessBlockCommand,
  SimPutPublicAccessBlockCommandOutput,
} from "./put-public-access-block.command.js";

interface PutPublicAccessBlockCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 PutPublicAccessBlockCommand handler.
 */
export class PutPublicAccessBlockCommandHandler implements CommandHandler<
  SimPutPublicAccessBlockCommand,
  SimPutPublicAccessBlockCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3PublicAccessBlockAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: PutPublicAccessBlockCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3PublicAccessBlockAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and replace a Bucket's Block Public Access settings.
   *
   * The supplied configuration replaces the previous one wholesale, so a
   * setting it leaves out is turned off rather than kept from whatever the
   * Bucket had before.
   */
  async handle(
    command: SimPutPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutPublicAccessBlockCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "PutPublicAccessBlockCommand.input.Bucket",
    );
    assertDefined(
      command.input.PublicAccessBlockConfiguration,
      "PutPublicAccessBlockCommand.input.PublicAccessBlockConfiguration",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeWrite(bucket, options);

    bucket.configurePublicAccessBlock(
      SimS3PublicAccessBlock.fromConfiguration(
        command.input.PublicAccessBlockConfiguration,
      ),
    );

    return {
      $metadata: {},
    };
  }
}
