import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { simS3QuotedETag } from "../../object/s3-object-etag.js";
import {
  SimS3MultipartAccess,
  type SimS3MultipartAccessProperties,
} from "../multipart/sim-s3-multipart-access.js";
import { simS3WriteBodyBuffer } from "../../object/s3-write-body.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimUploadPartCommand,
  SimUploadPartCommandOutput,
} from "./upload-part.command.js";

/**
 * Simulated S3 UploadPartCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/UploadPartCommand/
 */
export class UploadPartCommandHandler implements CommandHandler<
  SimUploadPartCommand,
  SimUploadPartCommandOutput
> {
  private readonly access: SimS3MultipartAccess;

  constructor(properties: SimS3MultipartAccessProperties) {
    this.access = new SimS3MultipartAccess(properties);
  }

  /**
   * Store one numbered part of an upload in progress.
   *
   * The parts of an upload can arrive in any order, and a client sending
   * several at once routinely finishes a later one first, so this stores the
   * part under its number and leaves the ordering to the completion.
   */
  async handle(
    command: SimUploadPartCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimUploadPartCommandOutput> {
    const { Bucket, Key, UploadId, PartNumber } = command.input;
    assertDefined(Bucket, "UploadPartCommand.input.Bucket");
    assertDefined(Key, "UploadPartCommand.input.Key");
    assertDefined(UploadId, "UploadPartCommand.input.UploadId");
    assertDefined(PartNumber, "UploadPartCommand.input.PartNumber");

    const { bucket } = await this.access.reach(Bucket, Key, options);
    const upload = this.access.requireUpload(bucket, UploadId);

    const part = upload.putPart(
      PartNumber,
      simS3WriteBodyBuffer(command.input.Body, "UploadPartCommand"),
      this.access.now(),
    );

    return { ETag: simS3QuotedETag(part.etag), $metadata: {} };
  }
}
