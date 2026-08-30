import type { SimS3ObjectVersion } from "../../bucket/versioning/sim-s3-object-version.js";
import { simS3QuotedETag } from "../../object/s3-object-etag.js";
import { simS3DefaultStorageClass } from "../../object/s3-object-summary.js";
import type {
  SimS3DeleteMarkerSummary,
  SimS3ObjectVersionSummary,
} from "./list-object-versions.command.js";

/**
 * Whether a version is the one a read of its key answers with.
 */
export type SimS3IsLatestVersion = (version: SimS3ObjectVersion) => boolean;

/**
 * Describe the Objects among a page of versions.
 */
export function simS3ObjectVersionSummaries(
  page: readonly SimS3ObjectVersion[],
  isLatest: SimS3IsLatestVersion,
): readonly SimS3ObjectVersionSummary[] {
  return page
    .filter((version) => !version.isDeleteMarker)
    .map((version) => ({
      Key: version.key,
      VersionId: version.versionId,
      IsLatest: isLatest(version),
      LastModified: version.lastModified,
      ETag: simS3QuotedETag(version.object.etag),
      Size: version.object.body.length,
      StorageClass: simS3DefaultStorageClass,
    }));
}

/**
 * Describe the delete markers among a page of versions.
 *
 * A marker holds no bytes, so it carries neither a size nor an ETag, which is
 * why real S3 sends the two kinds in separate lists.
 */
export function simS3DeleteMarkerSummaries(
  page: readonly SimS3ObjectVersion[],
  isLatest: SimS3IsLatestVersion,
): readonly SimS3DeleteMarkerSummary[] {
  return page
    .filter((version) => version.isDeleteMarker)
    .map((version) => ({
      Key: version.key,
      VersionId: version.versionId,
      IsLatest: isLatest(version),
      LastModified: version.lastModified,
    }));
}
