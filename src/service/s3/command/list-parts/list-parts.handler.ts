import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { simS3QuotedETag } from "../../object/s3-object-etag.js";
import {
  SimS3MultipartAccess,
  type SimS3MultipartAccessProperties,
} from "../multipart/sim-s3-multipart-access.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimListPartsCommand,
  SimListPartsCommandOutput,
} from "./list-parts.command.js";

/**
 * Simulated S3 ListPartsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListPartsCommand/
 */
export class ListPartsCommandHandler implements CommandHandler<
  SimListPartsCommand,
  SimListPartsCommandOutput
> {
  private readonly access: SimS3MultipartAccess;

  constructor(properties: SimS3MultipartAccessProperties) {
    this.access = new SimS3MultipartAccess(properties);
  }

  /**
   * Report the parts stored against an upload so far.
   *
   * In part-number order rather than arrival order, which is how a client
   * resuming an upload works out which parts it still owes. Every part comes
   * back on one page, as with the upload listing.
   */
  async handle(
    command: SimListPartsCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimListPartsCommandOutput> {
    const { Bucket, Key, UploadId } = command.input;
    assertDefined(Bucket, "ListPartsCommand.input.Bucket");
    assertDefined(Key, "ListPartsCommand.input.Key");
    assertDefined(UploadId, "ListPartsCommand.input.UploadId");

    const { bucket } = await this.access.reach(Bucket, Key, options);
    const upload = this.access.requireUpload(bucket, UploadId);
    const parts = upload.storedParts();

    return {
      Bucket: bucket.bucketName,
      Key,
      UploadId,
      Parts:
        parts.length === 0
          ? undefined
          : parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: simS3QuotedETag(part.etag),
              Size: part.body.length,
              LastModified: part.lastModified,
            })),
      StorageClass: upload.storageClass,
      IsTruncated: false,
      $metadata: {},
    };
  }
}
