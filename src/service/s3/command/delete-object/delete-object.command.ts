import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 DeleteObject command.
 */
export interface SimDeleteObjectCommand {
  readonly input: SimDeleteObjectCommandInput;
}

/**
 * Minimal structural sim S3 DeleteObject input.
 */
export interface SimDeleteObjectCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /**
   * The version to remove permanently.
   *
   * A request naming none asks for the current version, which a versioned
   * Bucket answers by writing a delete marker rather than removing anything.
   */
  readonly VersionId?: string | undefined;
}

/**
 * Minimal structural sim S3 DeleteObject output.
 *
 * `DeleteMarker` and `VersionId` describe what a versioned Bucket did. A
 * Bucket without versioning carries neither, as real S3 does.
 */
export interface SimDeleteObjectCommandOutput {
  readonly DeleteMarker?: boolean | undefined;
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
