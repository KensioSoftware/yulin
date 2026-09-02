import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectTagInput } from "../../object/s3-object-tags.js";

/**
 * Minimal structural sim S3 PutObjectTagging command.
 */
export interface SimPutObjectTaggingCommand {
  readonly input: SimPutObjectTaggingCommandInput;
}

/**
 * Minimal structural sim S3 PutObjectTagging input.
 *
 * The tag set arrives as a list here rather than as the query string a write
 * carries it in, because this request has a body of its own to put it in.
 */
export interface SimPutObjectTaggingCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /** The version to tag. A request naming none tags the current one. */
  readonly VersionId?: string | undefined;
  readonly Tagging?: SimS3TaggingInput | undefined;
}

/**
 * Minimal structural sim S3 tag set, as a tagging request states one.
 */
export interface SimS3TaggingInput {
  readonly TagSet?: readonly SimS3ObjectTagInput[] | undefined;
}

/**
 * Minimal structural sim S3 PutObjectTagging output.
 *
 * `VersionId` is the version the tags were put on, on a Bucket keeping
 * versions.
 */
export interface SimPutObjectTaggingCommandOutput {
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
