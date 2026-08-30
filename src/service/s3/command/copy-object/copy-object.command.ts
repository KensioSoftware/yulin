import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectWriteMetadata } from "../../object/s3-write-metadata.js";

/**
 * Minimal structural sim S3 CopyObject command.
 */
export interface SimCopyObjectCommand {
  readonly input: SimCopyObjectCommandInput;
}

/**
 * Minimal structural sim S3 CopyObject input.
 *
 * The write metadata members are the same ones `PutObject` carries, and they
 * apply to the destination Object under `MetadataDirective: REPLACE`. Under
 * the default `COPY` they are ignored, as real S3 ignores them.
 */
export interface SimCopyObjectCommandInput extends SimS3ObjectWriteMetadata {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /** The source Object, as `sourceBucket/sourceKey`, URL-encoded. */
  readonly CopySource?: string | undefined;
  readonly MetadataDirective?: string | undefined;
}

/**
 * Minimal structural sim S3 CopyObject output.
 *
 * The copy's own ETag and write time arrive nested in `CopyObjectResult`
 * rather than at the top level, because real S3 sends them in the response
 * body and the top-level headers describe the request. `VersionId` is the
 * version the copy was written as, on a Bucket keeping versions.
 */
export interface SimCopyObjectCommandOutput {
  readonly CopyObjectResult?: SimCopyObjectResult;
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What a copy says about the Object it wrote.
 */
export interface SimCopyObjectResult {
  readonly ETag?: string;
  readonly LastModified?: Date;
}
