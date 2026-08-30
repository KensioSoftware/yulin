/**
 * Structural shape of an S3 VersioningConfiguration.
 *
 * Matches the AWS SDK and CloudFormation property shape, so the same object
 * can come from either.
 */
export interface SimS3VersioningConfiguration {
  readonly Status?: string | undefined;
  readonly MFADelete?: string | undefined;
}

/**
 * The version id S3 gives an Object written while versioning was off.
 *
 * Real S3 reports the literal string `null` for one, and accepts it back as a
 * `VersionId` on a read or a delete.
 */
export const simS3NullVersionId = "null";

/**
 * Whether one simulated S3 Bucket keeps Object versions.
 *
 * There are three states and only two of them are reachable twice. A Bucket
 * starts unversioned, and a Bucket that has been versioned can be suspended
 * but never taken back to unversioned. Real S3 has no request that removes the
 * configuration, which is what makes versioning the one Bucket setting a
 * template cannot undo.
 *
 * Suspended is the state worth being careful about. It stops new versions
 * being made without discarding the ones already there. An Object put while
 * suspended takes the null version id and replaces whatever else holds it,
 * leaving every earlier version readable by its own id.
 */
export class SimS3BucketVersioning {
  private constructor(
    private readonly state: "Unversioned" | "Enabled" | "Suspended",
  ) {}

  /**
   * The state a Bucket nobody has configured is in.
   */
  static unversioned(): SimS3BucketVersioning {
    return new SimS3BucketVersioning("Unversioned");
  }

  /**
   * The state a PutBucketVersioning request asks for.
   */
  static fromConfiguration(
    configuration: SimS3VersioningConfiguration,
  ): SimS3BucketVersioning {
    return configuration.Status === "Enabled"
      ? new SimS3BucketVersioning("Enabled")
      : new SimS3BucketVersioning("Suspended");
  }

  /**
   * What GetBucketVersioning answers with.
   *
   * A Bucket nobody has configured has no status at all, which real S3 reports
   * as a response carrying neither `Status` nor `MFADelete`.
   */
  get status(): "Enabled" | "Suspended" | undefined {
    return this.state === "Unversioned" ? undefined : this.state;
  }

  /**
   * Whether a write to this Bucket is given a version id of its own.
   */
  get isEnabled(): boolean {
    return this.state === "Enabled";
  }

  /**
   * Whether this Bucket holds a version history at all.
   *
   * A suspended Bucket still holds one. The versions written before the
   * suspension stay readable, and only new writes stop adding to them.
   */
  get keepsVersions(): boolean {
    return this.state !== "Unversioned";
  }
}
