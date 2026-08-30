import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectLockOutput } from "../../bucket/lock/sim-s3-object-lock-output.js";
import type { SimS3SystemMetadataOutput } from "../../object/s3-system-metadata-read.js";

/**
 * Minimal structural sim S3 HeadObject command.
 */
export interface SimHeadObjectCommand {
  readonly input: SimHeadObjectCommandInput;
}

/**
 * Minimal structural sim S3 HeadObject input.
 */
export interface SimHeadObjectCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /**
   * The version to read. A request naming none reads the current version, and
   * a Bucket keeping no versions answers the Object under the key.
   */
  readonly VersionId?: string | undefined;
}

/**
 * Minimal structural sim S3 HeadObject output.
 *
 * A HEAD answers with what a read would have said about the Object and none of
 * the Object itself, so this is a GetObject output without its body and with
 * the length that body would have had.
 */
export interface SimHeadObjectCommandOutput
  extends SimS3SystemMetadataOutput, SimS3ObjectLockOutput {
  readonly ContentLength?: number;
  readonly Metadata?: Record<string, string>;
  readonly ETag?: string;
  readonly LastModified?: Date;
  /** The version described, on a Bucket keeping versions. */
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
