import { randomUUID } from "node:crypto";

import type { SimS3ObjectMetadata } from "../object/s3-object.js";
import {
  SimS3MultipartUpload,
  type SimS3UploadId,
} from "./sim-s3-multipart-upload.js";

interface SimS3StartUploadProperties {
  readonly key: string;
  readonly metadata: SimS3ObjectMetadata;
  readonly initiated: Date;
}

/**
 * The multipart uploads one Bucket has in progress.
 *
 * Uploads belong to a Bucket rather than to its storage, because they are not
 * Objects yet: the parts live here until `CompleteMultipartUpload` joins them
 * into one Object and hands that to storage. Held in memory whatever the
 * Bucket's storage is, since a mounted directory writes whole files and has
 * nowhere to put half of one.
 */
export class SimS3MultipartUploads {
  private readonly uploads = new Map<string, SimS3MultipartUpload>();

  /**
   * Issue an upload id and start holding parts under it.
   *
   * The id is opaque to a client, which sends back whatever it was given, so a
   * UUID does everything real S3's longer token does.
   */
  start(properties: SimS3StartUploadProperties): SimS3MultipartUpload {
    const upload = new SimS3MultipartUpload({
      uploadId: randomUUID(),
      key: properties.key,
      metadata: properties.metadata,
      initiated: properties.initiated,
    });

    this.uploads.set(upload.uploadId, upload);

    return upload;
  }

  /**
   * The upload an id names, if this Bucket has one in progress under it.
   */
  find(uploadId: SimS3UploadId | string): SimS3MultipartUpload | undefined {
    return this.uploads.get(uploadId);
  }

  /**
   * Forget an upload and every part stored against it.
   *
   * Both the abort and the completion end here: real S3 keeps nothing about an
   * upload once it has stopped being one, so a completed upload id is as
   * unknown afterwards as an aborted one.
   */
  discard(uploadId: SimS3UploadId | string): void {
    this.uploads.delete(uploadId);
  }

  /**
   * The uploads in progress, in the order real S3 lists them.
   *
   * S3 orders a multipart upload listing by key, and by when the upload was
   * started within one key, so two uploads to the same key come back oldest
   * first.
   */
  inProgress(prefix?: string): readonly SimS3MultipartUpload[] {
    return this.uploads
      .values()
      .filter((upload) => prefix === undefined || upload.key.startsWith(prefix))
      .toArray()
      .toSorted(
        (one, other) =>
          one.key.localeCompare(other.key) ||
          one.initiated.getTime() - other.initiated.getTime(),
      );
  }
}
