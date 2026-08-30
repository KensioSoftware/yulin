import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 ListObjectVersions command.
 */
export interface SimListObjectVersionsCommand {
  readonly input: SimListObjectVersionsCommandInput;
}

/**
 * Minimal structural sim S3 ListObjectVersions input.
 */
export interface SimListObjectVersionsCommandInput {
  readonly Bucket?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly MaxKeys?: number | undefined;
  /** The key the previous page ended on, resumed after rather than at. */
  readonly KeyMarker?: string | undefined;
  /** The version the previous page ended on, within `KeyMarker`. */
  readonly VersionIdMarker?: string | undefined;
}

/**
 * Minimal structural sim S3 ListObjectVersions output.
 *
 * Objects and delete markers come back in two lists rather than one, as real
 * S3 sends them, because a marker holds no size or ETag to describe.
 */
export interface SimListObjectVersionsCommandOutput {
  readonly Versions?: readonly SimS3ObjectVersionSummary[];
  readonly DeleteMarkers?: readonly SimS3DeleteMarkerSummary[];
  readonly Name?: string;
  readonly Prefix?: string | undefined;
  readonly MaxKeys?: number;
  readonly IsTruncated?: boolean;
  readonly KeyMarker?: string | undefined;
  readonly VersionIdMarker?: string | undefined;
  readonly NextKeyMarker?: string | undefined;
  readonly NextVersionIdMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * One version of an Object, as a listing describes it.
 */
export interface SimS3ObjectVersionSummary {
  readonly Key: string;
  readonly VersionId: string;
  readonly IsLatest: boolean;
  readonly LastModified: Date;
  readonly ETag: string;
  readonly Size: number;
  readonly StorageClass: string;
}

/**
 * One delete marker, as a listing describes it.
 */
export interface SimS3DeleteMarkerSummary {
  readonly Key: string;
  readonly VersionId: string;
  readonly IsLatest: boolean;
  readonly LastModified: Date;
}
