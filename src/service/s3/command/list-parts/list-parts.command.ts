import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 ListParts command.
 */
export interface SimListPartsCommand {
  readonly input: SimListPartsCommandInput;
}

/**
 * Minimal structural sim S3 ListParts input.
 */
export interface SimListPartsCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly UploadId?: string | undefined;
}

/**
 * One stored part, as a listing describes it.
 */
export interface SimUploadPartSummary {
  readonly PartNumber?: number;
  readonly ETag?: string;
  readonly Size?: number;
  readonly LastModified?: Date;
}

/**
 * Minimal structural sim S3 ListParts output.
 */
export interface SimListPartsCommandOutput {
  readonly Bucket?: string;
  readonly Key?: string;
  readonly UploadId?: string;
  readonly Parts?: SimUploadPartSummary[] | undefined;
  readonly StorageClass?: string;
  readonly IsTruncated?: boolean;
  readonly $metadata: SimResponseMetadata;
}
