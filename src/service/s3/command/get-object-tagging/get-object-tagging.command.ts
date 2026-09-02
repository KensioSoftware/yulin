import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectTag } from "../../object/s3-object-tags.js";

/**
 * Minimal structural sim S3 GetObjectTagging command.
 */
export interface SimGetObjectTaggingCommand {
  readonly input: SimGetObjectTaggingCommandInput;
}

/**
 * Minimal structural sim S3 GetObjectTagging input.
 */
export interface SimGetObjectTaggingCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /** The version to read. A request naming none reads the current one. */
  readonly VersionId?: string | undefined;
}

/**
 * Minimal structural sim S3 GetObjectTagging output.
 *
 * `TagSet` is always present, and is empty for an Object nobody has tagged.
 * Real S3 answers an untagged Object with an empty set rather than refusing,
 * because having no tags is not the same as not existing.
 */
export interface SimGetObjectTaggingCommandOutput {
  readonly TagSet: readonly SimS3ObjectTag[];
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
