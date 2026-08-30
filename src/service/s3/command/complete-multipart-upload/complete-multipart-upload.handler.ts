import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { simS3BucketUrl } from "../../bucket/sim-s3-endpoint-url.js";
import { simS3QuotedETag } from "../../object/s3-object-etag.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import {
  simS3CompletedUploadObject,
  type SimS3NamedUploadPart,
} from "../../upload/sim-s3-completed-upload.js";
import {
  SimS3MultipartAccess,
  type SimS3MultipartAccessProperties,
} from "../multipart/sim-s3-multipart-access.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimCompleteMultipartUploadCommand,
  SimCompleteMultipartUploadCommandOutput,
  SimCompletedUploadPart,
} from "./complete-multipart-upload.command.js";

interface CompleteMultipartUploadHandlerProperties extends SimS3MultipartAccessProperties {
  readonly notifications: SimS3ObjectNotifier;
}

/**
 * Simulated S3 CompleteMultipartUploadCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CompleteMultipartUploadCommand/
 */
export class CompleteMultipartUploadCommandHandler implements CommandHandler<
  SimCompleteMultipartUploadCommand,
  SimCompleteMultipartUploadCommandOutput
> {
  private readonly access: SimS3MultipartAccess;
  private readonly notifications: SimS3ObjectNotifier;

  constructor(properties: CompleteMultipartUploadHandlerProperties) {
    this.access = new SimS3MultipartAccess(properties);
    this.notifications = properties.notifications;
  }

  /**
   * Join the parts into one Object and put it under the upload's key.
   *
   * The upload is discarded whether or not it produced an Object, but only
   * after the joining has succeeded: a completion S3 refused leaves the parts
   * where they are, so the client can name them correctly and try again.
   */
  async handle(
    command: SimCompleteMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimCompleteMultipartUploadCommandOutput> {
    const { Bucket, Key, UploadId } = command.input;
    assertDefined(Bucket, "CompleteMultipartUploadCommand.input.Bucket");
    assertDefined(Key, "CompleteMultipartUploadCommand.input.Key");
    assertDefined(UploadId, "CompleteMultipartUploadCommand.input.UploadId");

    const { bucket, caller } = await this.access.reach(Bucket, Key, options);
    const upload = this.access.requireUpload(bucket, UploadId);

    const object = simS3CompletedUploadObject({
      upload,
      parts: namedParts(command.input.MultipartUpload?.Parts ?? []),
      completedAt: this.access.now(),
    });

    const version = await bucket.putObject(object);
    bucket.getMultipartUploads().discard(UploadId);

    this.notifications.objectCreated({
      bucket,
      object,
      caller,
      eventName: "s3:ObjectCreated:CompleteMultipartUpload",
      versionId: version?.versionId,
    });

    return {
      Location: new URL(object.key, uploadedTo(bucket)).href,
      Bucket: bucket.bucketName,
      Key: object.key,
      ETag: simS3QuotedETag(object.etag),
      ...(version !== undefined && { VersionId: version.versionId }),
      $metadata: {},
    };
  }
}

/**
 * Where a completed Object can be read from, which real S3 answers with.
 *
 * The virtual-hosted URL of the simulated Bucket, so a caller that follows the
 * Location reaches the Object it has just uploaded rather than an AWS hostname
 * nothing in the simulation answers on.
 */
function uploadedTo(bucket: SimS3Bucket): URL {
  return simS3BucketUrl(
    bucket.bucketName,
    bucket.getAccountRegionScope().regionName,
  );
}

/**
 * The parts a completion names, with the numbers it has to have stated.
 */
function namedParts(
  parts: readonly SimCompletedUploadPart[],
): readonly SimS3NamedUploadPart[] {
  return parts.map((part, index) => {
    assertDefined(
      part.PartNumber,
      `CompleteMultipartUploadCommand.input.MultipartUpload.Parts[${index}].PartNumber`,
    );

    return { partNumber: part.PartNumber, etag: part.ETag };
  });
}
