import { SimS3AccessDenied } from "../../error/sim-s3.error.js";
import type { SimS3ObjectVersion } from "../versioning/sim-s3-object-version.js";
import type { SimS3ObjectLockConfiguration } from "./sim-s3-object-lock-configuration.js";

/**
 * The Object Lock of one simulated S3 Bucket.
 *
 * It holds the configuration and applies it, which is two jobs a Bucket needs
 * doing in two different places. A write asks it what retention the new
 * version starts with, and a delete asks it whether the version may go.
 */
export class SimS3BucketObjectLock {
  private locking: SimS3ObjectLockConfiguration | undefined;

  /** How this Bucket is locked, or nothing where it has never been. */
  get configuration(): SimS3ObjectLockConfiguration | undefined {
    return this.locking;
  }

  /** Whether Object Lock is on. */
  get isEnabled(): boolean {
    return this.locking !== undefined;
  }

  /**
   * Turn Object Lock on, or replace the default retention it carries.
   *
   * Real S3 has no request that turns it off, so this only ever arrives at a
   * configuration with it on.
   */
  configure(configuration: SimS3ObjectLockConfiguration): void {
    this.locking = configuration;
  }

  /**
   * Give a newly written version the Bucket's default retention, if it has
   * one, and hand the version back.
   *
   * The period is counted from the write, so two versions of one key written a
   * day apart are retained until two different instants. A Bucket keeping no
   * versions wrote none, and gets nothing back.
   */
  withDefaultRetention(
    version: SimS3ObjectVersion | undefined,
    writtenAt: Date,
  ): SimS3ObjectVersion | undefined {
    const retention = this.locking?.retentionAt(writtenAt);

    if (version !== undefined && retention !== undefined) {
      version.lock.setDefaultRetention(retention);
    }

    return version;
  }

  /**
   * Refuse a delete Object Lock is holding a version against.
   *
   * Real S3 answers this with `AccessDenied`, the same code it answers a
   * caller with no permission with. The reason says which of the two things
   * holding the version is doing it, since a legal hold and a retention period
   * are got past in different ways. A version that is not there is held
   * against nothing, and the delete goes on to report it missing.
   */
  assertDeletable(
    version: SimS3ObjectVersion | undefined,
    instant: Date,
    bypassed: boolean,
  ): void {
    const refusal = version?.lock.refusesDeleteAt(instant, bypassed);

    if (version !== undefined && refusal !== undefined) {
      throw new SimS3AccessDenied(
        `Version ${version.versionId} of S3 Object ${version.key} cannot be ` +
          `deleted because ${refusal}`,
      );
    }
  }
}
