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
}

/**
 * Minimal structural sim S3 DeleteObject output.
 *
 * Real S3 reports `DeleteMarker` and `VersionId` on a versioned Bucket. Sim S3
 * does not model versioning, so neither appears here.
 */
export interface SimDeleteObjectCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
