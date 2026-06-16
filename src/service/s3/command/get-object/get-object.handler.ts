import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimGetObjectCommand,
  SimGetObjectCommandOutput,
} from "./get-object.cmd.js";
import { Readable } from "node:stream";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import { SimS3NoSuchBucket, SimS3NoSuchKey } from "../../error/s3.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";

interface GetObjectCommandHandlerProps {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
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
  private readonly background: BackgroundScheduler;

  constructor(props: GetObjectCommandHandlerProps) {
    const { buckets, background = new BackgroundTasks() } = props;
    this.buckets = buckets;
    this.background = background;
  }

  /**
   * Simulate getting an Object from an S3 Bucket.
   */
  async handle(cmd: SimGetObjectCommand): Promise<SimGetObjectCommandOutput> {
    assertDefined(cmd.input.Bucket, "GetObjectCommand.input.Bucket");
    assertDefined(cmd.input.Key, "GetObjectCommand.input.Key");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const object = await bucket.getObject(cmd.input.Key);
    if (object === undefined) {
      throw new SimS3NoSuchKey(`No S3 Object named ${cmd.input.Key}`);
    }

    return {
      Body: Readable.from([object.body]),
      Metadata: object.metadata.values,
      $metadata: {},
    };
  }
}
