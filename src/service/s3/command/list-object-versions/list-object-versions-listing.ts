import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { compareSimS3Keys } from "../../bucket/versioning/sim-s3-compare-keys.js";
import { SimS3ObjectVersion } from "../../bucket/versioning/sim-s3-object-version.js";
import type {
  SimS3DeleteMarkerSummary,
  SimS3ObjectVersionSummary,
} from "./list-object-versions.command.js";
import {
  simS3DeleteMarkerSummaries,
  simS3ObjectVersionSummaries,
} from "./list-object-versions-summaries.js";

/**
 * The versions a listing reports, and how it describes each of them.
 *
 * A Bucket that keeps no versions still answers this operation. Real S3 gives
 * every Object in one the null version id and marks it latest, so the listing
 * of an unversioned Bucket reads as a version history one entry deep rather
 * than as an error or an empty response.
 */
export class ListObjectVersionsListing {
  private readonly bucket: SimS3Bucket;

  constructor(bucket: SimS3Bucket) {
    this.bucket = bucket;
  }

  /**
   * Every version under a prefix, in the order a listing reports them.
   */
  async versions(prefix?: string): Promise<readonly SimS3ObjectVersion[]> {
    // Read the Objects first either way. That is what applies the lifecycle
    // rules, and on a versioned Bucket it writes the delete marker an expiry
    // leaves behind. Reading the history without it would report a version the
    // rules have already expired as the current one.
    const objects = await this.bucket.listObjects(prefix);

    if (this.bucket.getVersions().keepsVersions) {
      return this.bucket.getVersions().list(prefix);
    }

    return objects
      .toSorted((left, right) => compareSimS3Keys(left.key, right.key))
      .map((object) => SimS3ObjectVersion.nullVersionOf(object));
  }

  /**
   * Describe the Objects among a page of versions.
   */
  objectSummaries(
    page: readonly SimS3ObjectVersion[],
  ): readonly SimS3ObjectVersionSummary[] {
    return simS3ObjectVersionSummaries(page, (version) =>
      this.isLatest(version),
    );
  }

  /**
   * Describe the delete markers among a page of versions.
   */
  deleteMarkerSummaries(
    page: readonly SimS3ObjectVersion[],
  ): readonly SimS3DeleteMarkerSummary[] {
    return simS3DeleteMarkerSummaries(page, (version) =>
      this.isLatest(version),
    );
  }

  /**
   * Whether a version is the one a read of its key answers with.
   */
  private isLatest(version: SimS3ObjectVersion): boolean {
    const versions = this.bucket.getVersions();

    if (!versions.keepsVersions) {
      return true;
    }

    return versions.current(version.key)?.versionId === version.versionId;
  }
}
