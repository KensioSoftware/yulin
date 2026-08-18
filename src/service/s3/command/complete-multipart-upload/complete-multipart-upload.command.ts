import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 CompleteMultipartUpload command.
 */
export interface SimCompleteMultipartUploadCommand {
  readonly input: SimCompleteMultipartUploadCommandInput;
}

/**
 * One part as a completion names it.
 */
export interface SimCompletedUploadPart {
  readonly PartNumber?: number | undefined;
  readonly ETag?: string | undefined;
}

/**
 * Minimal structural sim S3 CompleteMultipartUpload input.
 *
 * The parts are named by the request rather than assumed by S3, so a client can
 * finish an upload it sent a part of twice.
 */
export interface SimCompleteMultipartUploadCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly UploadId?: string | undefined;
  readonly MultipartUpload?:
    | { readonly Parts?: readonly SimCompletedUploadPart[] | undefined }
    | undefined;
}

/**
 * Minimal structural sim S3 CompleteMultipartUpload output.
 *
 * `ETag` is the multipart form, `<md5-of-the-part-md5s>-<partCount>`, quoted as
 * every ETag on the wire is.
 */
export interface SimCompleteMultipartUploadCommandOutput {
  readonly Location?: string;
  readonly Bucket?: string;
  readonly Key?: string;
  readonly ETag?: string;
  readonly $metadata: SimResponseMetadata;
}
