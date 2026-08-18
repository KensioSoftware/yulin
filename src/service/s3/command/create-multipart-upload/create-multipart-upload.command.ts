import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectWriteMetadata } from "../../object/s3-write-metadata.js";

/**
 * Minimal structural sim S3 CreateMultipartUpload command.
 */
export interface SimCreateMultipartUploadCommand {
  readonly input: SimCreateMultipartUploadCommandInput;
}

/**
 * Minimal structural sim S3 CreateMultipartUpload input.
 *
 * This is the request that says what the Object will be, so it carries the same
 * metadata members a `PutObject` does. None of the Object's bytes arrive here.
 */
export interface SimCreateMultipartUploadCommandInput extends SimS3ObjectWriteMetadata {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
}

/**
 * Minimal structural sim S3 CreateMultipartUpload output.
 *
 * `UploadId` is what every later request in the upload names it by.
 */
export interface SimCreateMultipartUploadCommandOutput {
  readonly Bucket?: string;
  readonly Key?: string;
  readonly UploadId?: string;
  readonly $metadata: SimResponseMetadata;
}
