import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimS3MultipartAccess,
  type SimS3MultipartAccessProperties,
} from "../multipart/sim-s3-multipart-access.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimListMultipartUploadsCommand,
  SimListMultipartUploadsCommandOutput,
} from "./list-multipart-uploads.command.js";

/**
 * Simulated S3 ListMultipartUploadsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListMultipartUploadsCommand/
 */
export class ListMultipartUploadsCommandHandler implements CommandHandler<
  SimListMultipartUploadsCommand,
  SimListMultipartUploadsCommandOutput
> {
  private readonly access: SimS3MultipartAccess;

  constructor(properties: SimS3MultipartAccessProperties) {
    this.access = new SimS3MultipartAccess(properties);
  }

  /**
   * Report the uploads a Bucket has in progress.
   *
   * This is what tells an upload that stalled from one that never started, and
   * what a cleanup walks to abort whatever is left holding parts. Every upload
   * comes back on one page, because the simulator holds parts in memory and
   * nothing is going to accumulate the thousand uploads real S3 pages at.
   */
  async handle(
    command: SimListMultipartUploadsCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimListMultipartUploadsCommandOutput> {
    const { Bucket, Prefix } = command.input;
    assertDefined(Bucket, "ListMultipartUploadsCommand.input.Bucket");

    const { bucket } = await this.access.reach(Bucket, undefined, options);
    const uploads = bucket.getMultipartUploads().inProgress(Prefix);

    return {
      Bucket: bucket.bucketName,
      Prefix,
      Uploads:
        uploads.length === 0
          ? undefined
          : uploads.map((upload) => ({
              Key: upload.key,
              UploadId: upload.uploadId,
              Initiated: upload.initiated,
              StorageClass: upload.storageClass,
            })),
      IsTruncated: false,
      $metadata: {},
    };
  }
}
