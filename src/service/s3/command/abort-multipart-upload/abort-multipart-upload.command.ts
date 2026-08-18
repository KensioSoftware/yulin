import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 AbortMultipartUpload command.
 */
export interface SimAbortMultipartUploadCommand {
  readonly input: SimAbortMultipartUploadCommandInput;
}

/**
 * Minimal structural sim S3 AbortMultipartUpload input.
 */
export interface SimAbortMultipartUploadCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly UploadId?: string | undefined;
}

/**
 * Minimal structural sim S3 AbortMultipartUpload output, which says nothing
 * beyond having worked.
 */
export interface SimAbortMultipartUploadCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
