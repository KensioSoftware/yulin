import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 DeleteObjectTagging command.
 */
export interface SimDeleteObjectTaggingCommand {
  readonly input: SimDeleteObjectTaggingCommandInput;
}

/**
 * Minimal structural sim S3 DeleteObjectTagging input.
 */
export interface SimDeleteObjectTaggingCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /** The version to untag. A request naming none untags the current one. */
  readonly VersionId?: string | undefined;
}

/**
 * Minimal structural sim S3 DeleteObjectTagging output.
 */
export interface SimDeleteObjectTaggingCommandOutput {
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
