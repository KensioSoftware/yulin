import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3WriteBody } from "../../object/s3-write-body.js";

/**
 * Minimal structural sim S3 UploadPart command.
 */
export interface SimUploadPartCommand {
  readonly input: SimUploadPartCommandInput;
}

/**
 * Minimal structural sim S3 UploadPart input.
 *
 * The body forms are the ones `PutObject` takes, because a part is bytes on
 * their way to an Object and arrives the same way they do.
 */
export interface SimUploadPartCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly UploadId?: string | undefined;
  readonly PartNumber?: number | undefined;
  readonly Body?: SimS3WriteBody;
}

/**
 * Minimal structural sim S3 UploadPart output.
 *
 * `ETag` is the quoted MD5 of the part's own bytes, which the client sends back
 * in the completion to say which part it means.
 */
export interface SimUploadPartCommandOutput {
  readonly ETag?: string;
  readonly $metadata: SimResponseMetadata;
}
