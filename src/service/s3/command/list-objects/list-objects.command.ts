import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3CommonPrefix } from "../../object/s3-common-prefix.js";
import type { SimS3ObjectSummary } from "../../object/s3-object-summary.js";

export type { SimS3ObjectSummary } from "../../object/s3-object-summary.js";

/**
 * Minimal structural sim S3 ListObjects command.
 */
export interface SimListObjectsCommand {
  readonly input: SimListObjectsCommandInput;
}

/**
 * Minimal structural sim S3 ListObjects input.
 *
 * `Delimiter` rolls every key holding it after the `Prefix` up into a common
 * prefix, which is how a Bucket is walked one folder at a time. `EncodingType`
 * asks for the keys the listing answers with to be encoded, so that a key
 * holding a character XML cannot carry survives the response.
 */
export interface SimListObjectsCommandInput {
  readonly Bucket?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly Delimiter?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxKeys?: number | undefined;
  readonly EncodingType?: string | undefined;
}

/**
 * Minimal structural sim S3 ListObjects output.
 */
export interface SimListObjectsCommandOutput {
  readonly Contents?: SimS3ObjectSummary[] | undefined;
  readonly CommonPrefixes?: SimS3CommonPrefix[] | undefined;
  readonly Name?: string;
  readonly Prefix?: string | undefined;
  readonly Delimiter?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxKeys?: number;
  readonly IsTruncated?: boolean;
  readonly NextMarker?: string | undefined;
  readonly EncodingType?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
