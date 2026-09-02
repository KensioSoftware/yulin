import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectWriteMetadata } from "../../object/s3-write-metadata.js";
import type { SimS3ObjectWriteStorage } from "../../object/s3-write-storage.js";
import type { SimS3ObjectWriteTagging } from "../../object/s3-write-tagging.js";

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
export interface SimCopyObjectCommandInput
  extends
    SimS3ObjectWriteMetadata,
    SimS3ObjectWriteStorage,
    SimS3ObjectWriteTagging {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /** The source Object, as `sourceBucket/sourceKey`, URL-encoded. */
  readonly CopySource?: string | undefined;
  readonly MetadataDirective?: string | undefined;
  /**
   * Whether the copy carries the source Object's tags or the request's own.
   * `REPLACE` takes the request's `Tagging`, and anything else leaves the copy
   * carrying what the source carried.
   */
  readonly TaggingDirective?: string | undefined;
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
  /** The encryption S3 stamped on the copy it stored. */
  readonly ServerSideEncryption?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What a copy says about the Object it wrote.
 */
export interface SimCopyObjectResult {
  readonly ETag?: string;
  readonly LastModified?: Date;
}
