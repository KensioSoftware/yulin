import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3CommonPrefix } from "../../object/s3-common-prefix.js";
import type { SimS3ObjectSummary } from "../../object/s3-object-summary.js";

/**
 * Minimal structural sim S3 ListObjectsV2 command.
 */
export interface SimListObjectsV2Command {
  readonly input: SimListObjectsV2CommandInput;
}

/**
 * Minimal structural sim S3 ListObjectsV2 input.
 *
 * `ContinuationToken` resumes a truncated listing and takes precedence over
 * `StartAfter`, which only positions the first page. `Delimiter` rolls every
 * key holding it after the `Prefix` up into a common prefix. `EncodingType`
 * asks for the keys the listing answers with to be encoded, so that a key
 * holding a character XML cannot carry survives the response.
 */
export interface SimListObjectsV2CommandInput {
  readonly Bucket?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly Delimiter?: string | undefined;
  readonly MaxKeys?: number | undefined;
  readonly ContinuationToken?: string | undefined;
  readonly StartAfter?: string | undefined;
  readonly EncodingType?: string | undefined;
}

/**
 * Minimal structural sim S3 ListObjectsV2 output.
 *
 * `KeyCount` is what makes this version worth using over the first: it says how
 * many keys came back without the caller having to measure `Contents`, which
 * may be absent rather than empty. It counts the common prefixes alongside the
 * keys, as real S3 counts them.
 */
export interface SimListObjectsV2CommandOutput {
  readonly Contents?: SimS3ObjectSummary[] | undefined;
  readonly CommonPrefixes?: SimS3CommonPrefix[] | undefined;
  readonly Name?: string;
  readonly Prefix?: string | undefined;
  readonly Delimiter?: string | undefined;
  readonly MaxKeys?: number;
  readonly KeyCount?: number;
  readonly IsTruncated?: boolean;
  readonly ContinuationToken?: string | undefined;
  readonly NextContinuationToken?: string | undefined;
  readonly StartAfter?: string | undefined;
  readonly EncodingType?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
