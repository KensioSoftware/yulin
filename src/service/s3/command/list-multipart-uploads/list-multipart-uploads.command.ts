import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 ListMultipartUploads command.
 */
export interface SimListMultipartUploadsCommand {
  readonly input: SimListMultipartUploadsCommandInput;
}

/**
 * Minimal structural sim S3 ListMultipartUploads input.
 */
export interface SimListMultipartUploadsCommandInput {
  readonly Bucket?: string | undefined;
  readonly Prefix?: string | undefined;
}

/**
 * One upload in progress, as a listing describes it.
 */
export interface SimMultipartUploadSummary {
  readonly Key?: string;
  readonly UploadId?: string;
  readonly Initiated?: Date;
  readonly StorageClass?: string;
}

/**
 * Minimal structural sim S3 ListMultipartUploads output.
 */
export interface SimListMultipartUploadsCommandOutput {
  readonly Bucket?: string;
  readonly Prefix?: string | undefined;
  readonly Uploads?: SimMultipartUploadSummary[] | undefined;
  readonly IsTruncated?: boolean;
  readonly $metadata: SimResponseMetadata;
}
