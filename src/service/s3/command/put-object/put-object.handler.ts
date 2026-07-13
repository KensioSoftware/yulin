import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutObjectCommand,
  SimPutObjectCommandOutput,
} from "./put-object.cmd.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsPrincipal } from "../../../aws/caller/sim-aws-caller.js";
import { PutObjectAuthorizer } from "./put-object-authorizer.js";
import { PutObjectBuilder } from "./put-object-builder.js";

interface PutObjectCommandHandlerProps {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface PutObjectCommandHandlerOptions {
  readonly caller?: SimAwsPrincipal;
}

/**
 * Simulated S3 PutObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/
 */
export class PutObjectCommandHandler implements CommandHandler<
  SimPutObjectCommand,
  SimPutObjectCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: PutObjectAuthorizer;
  private readonly objectBuilder = new PutObjectBuilder();
  private readonly background: BackgroundScheduler;

  constructor(props: PutObjectCommandHandlerProps) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;
    this.buckets = buckets;
    this.authorizer = new PutObjectAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Simulate putting an Object into an S3 Bucket.
   *
   * Required-input validation and Bucket lookup happen before authorization so
   * malformed requests and missing Buckets retain their S3 error behavior.
   * Authorization happens before request conversion and storage mutation so a
   * denied request cannot process, create, or replace an Object.
   *
   * Once authorization succeeds, PutObjectBuilder translates the SDK request
   * into the storage model. This handler remains responsible for request-level
   * sequencing while body and metadata conversion stay isolated from it.
   */
  async handle(
    cmd: SimPutObjectCommand,
    opts?: PutObjectCommandHandlerOptions,
  ): Promise<SimPutObjectCommandOutput> {
    assertDefined(cmd.input.Bucket, "PutObjectCommand.input.Bucket");
    assertDefined(cmd.input.Key, "PutObjectCommand.input.Key");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(bucketName, cmd.input.Key, opts?.caller);

    const object = this.objectBuilder.build(cmd);
    await bucket.putObject(object);

    return {
      $metadata: {},
    };
  }
}
