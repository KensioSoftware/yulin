import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimS3MultipartAccess,
  type SimS3MultipartAccessProperties,
} from "../multipart/sim-s3-multipart-access.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimAbortMultipartUploadCommand,
  SimAbortMultipartUploadCommandOutput,
} from "./abort-multipart-upload.command.js";

/**
 * Simulated S3 AbortMultipartUploadCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/AbortMultipartUploadCommand/
 */
export class AbortMultipartUploadCommandHandler implements CommandHandler<
  SimAbortMultipartUploadCommand,
  SimAbortMultipartUploadCommandOutput
> {
  private readonly access: SimS3MultipartAccess;

  constructor(properties: SimS3MultipartAccessProperties) {
    this.access = new SimS3MultipartAccess(properties);
  }

  /**
   * Give up on an upload, discarding every part stored against it.
   *
   * Nothing was under the key, so nothing is removed and no Object event is
   * raised: an abandoned upload leaves the Bucket as it found it. An upload id
   * S3 no longer holds is refused rather than treated as already gone, which is
   * what real S3 does.
   */
  async handle(
    command: SimAbortMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimAbortMultipartUploadCommandOutput> {
    const { Bucket, Key, UploadId } = command.input;
    assertDefined(Bucket, "AbortMultipartUploadCommand.input.Bucket");
    assertDefined(Key, "AbortMultipartUploadCommand.input.Key");
    assertDefined(UploadId, "AbortMultipartUploadCommand.input.UploadId");

    const { bucket } = await this.access.reach(Bucket, Key, options);
    this.access.requireUpload(bucket, UploadId);

    bucket.getMultipartUploads().discard(UploadId);

    return { $metadata: {} };
  }
}
