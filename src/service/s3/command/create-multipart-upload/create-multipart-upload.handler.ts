import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { simS3WriteMetadata } from "../../object/s3-write-metadata.js";
import {
  simS3WriteEncryption,
  simS3WriteStorageClass,
} from "../../object/s3-write-storage.js";
import { simS3WriteTags } from "../../object/s3-write-tagging.js";
import {
  SimS3MultipartAccess,
  type SimS3MultipartAccessProperties,
} from "../multipart/sim-s3-multipart-access.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimCreateMultipartUploadCommand,
  SimCreateMultipartUploadCommandOutput,
} from "./create-multipart-upload.command.js";

/**
 * Simulated S3 CreateMultipartUploadCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CreateMultipartUploadCommand/
 */
export class CreateMultipartUploadCommandHandler implements CommandHandler<
  SimCreateMultipartUploadCommand,
  SimCreateMultipartUploadCommandOutput
> {
  private readonly access: SimS3MultipartAccess;

  constructor(properties: SimS3MultipartAccessProperties) {
    this.access = new SimS3MultipartAccess(properties);
  }

  /**
   * Start an upload and issue the id its parts will be sent under.
   *
   * Nothing appears under the key until the upload is completed, so a Bucket
   * looks the same after this as it did before.
   */
  async handle(
    command: SimCreateMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimCreateMultipartUploadCommandOutput> {
    const { Bucket, Key } = command.input;
    assertDefined(Bucket, "CreateMultipartUploadCommand.input.Bucket");
    assertDefined(Key, "CreateMultipartUploadCommand.input.Key");

    const { bucket } = await this.access.reach(Bucket, Key, options);

    const storageClass = simS3WriteStorageClass(
      command.input,
      "CreateMultipartUploadCommand",
    );

    const upload = bucket.getMultipartUploads().start({
      key: Key,
      metadata: simS3WriteMetadata(command.input),
      tags: simS3WriteTags(command.input, "CreateMultipartUploadCommand"),
      initiated: this.access.now(),
      ...(storageClass !== undefined && { storageClass }),
      serverSideEncryption: simS3WriteEncryption(
        command.input,
        bucket.getEncryption().algorithm,
        "CreateMultipartUploadCommand",
      ),
    });

    return {
      Bucket: bucket.bucketName,
      Key: upload.key,
      UploadId: upload.uploadId,
      ServerSideEncryption: upload.serverSideEncryption,
      $metadata: {},
    };
  }
}
