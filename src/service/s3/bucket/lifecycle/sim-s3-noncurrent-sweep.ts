import type { SimS3BucketVersions } from "../versioning/sim-s3-bucket-versions.js";
import type { SimS3ObjectVersion } from "../versioning/sim-s3-object-version.js";
import type { SimS3LifecycleConfiguration } from "./sim-s3-lifecycle-configuration.js";
import { simS3TransitionedVersionClass } from "./sim-s3-lifecycle-transition.js";

/**
 * One pass over what a Bucket's rules have expired in its version history.
 *
 * The Object sweep works on storage, which holds the current Object under each
 * key and nothing else. Everything a `NoncurrentVersionExpiration` reaches is
 * therefore invisible to it, and so is the delete marker an
 * `ExpiredObjectDeleteMarker` removes. Both live in the history alone, which
 * is why removing them touches no storage and this pass is synchronous where
 * the Object sweep cannot be.
 *
 * A Bucket is swept when its versions are read, the way an Object is swept
 * when it is. Nothing runs on a schedule.
 */
export class SimS3NoncurrentSweep {
  private readonly lifecycle: SimS3LifecycleConfiguration;
  private readonly now: Date;

  constructor(lifecycle: SimS3LifecycleConfiguration, now: Date) {
    this.lifecycle = lifecycle;
    this.now = now;
  }

  /**
   * Remove what the rules have expired from a Bucket's history.
   */
  sweep(versions: SimS3BucketVersions): void {
    if (this.lifecycle.isEmpty || !versions.keepsVersions) {
      return;
    }

    for (const held of byKey(versions.list()).values()) {
      this.sweepKey(versions, held);
    }
  }

  /**
   * Remove what the rules have expired of one key.
   *
   * The noncurrent versions go first and a delete marker left bare goes
   * second, so a marker whose last version went in this same pass goes with
   * it. Real S3 orders the two the same way.
   *
   * The head of the list is the current version and no rule for noncurrent
   * ones reaches it, however old it is. Everything after it is counted from
   * the newest, which is the count `NewerNoncurrentVersions` holds back.
   */
  private sweepKey(
    versions: SimS3BucketVersions,
    held: readonly SimS3ObjectVersion[],
  ): void {
    const kept: SimS3ObjectVersion[] = [];

    for (const [index, version] of held.entries()) {
      if (index === 0 || !this.expires(version, index - 1)) {
        kept.push(version);
        this.transition(version, index - 1);
        continue;
      }

      versions.removeExpired(version.key, version.versionId);
    }

    this.sweepDeleteMarker(versions, kept);
  }

  /**
   * Remove a delete marker the rules have expired, which is one left with no
   * version under it at all.
   *
   * That takes the key out of `ListObjectVersions` altogether, since the
   * marker was the only thing left holding the key there.
   */
  private sweepDeleteMarker(
    versions: SimS3BucketVersions,
    kept: readonly SimS3ObjectVersion[],
  ): void {
    const marker = kept[0];

    if (
      kept.length === 1 &&
      marker?.isDeleteMarker === true &&
      this.lifecycle.expiresDeleteMarker(marker.key)
    ) {
      versions.removeExpired(marker.key, marker.versionId);
    }
  }

  /**
   * Move a surviving noncurrent version into the class the rules have
   * transitioned it to.
   *
   * The current version and a delete marker are left alone. Neither is
   * something a `NoncurrentVersionTransitions` rule reaches.
   */
  private transition(version: SimS3ObjectVersion, ahead: number): void {
    if (ahead < 0 || version.isDeleteMarker) {
      return;
    }

    const storageClass = simS3TransitionedVersionClass(
      this.lifecycle.enabledRules,
      {
        key: version.key,
        size: version.object.body.length,
        noncurrentSince: version.noncurrentSince,
        newerVersionsAhead: ahead,
      },
      this.now,
    );

    if (storageClass !== undefined) {
      version.transitionTo(storageClass);
    }
  }

  private expires(version: SimS3ObjectVersion, ahead: number): boolean {
    return this.lifecycle.expiresNoncurrent(
      {
        key: version.key,
        size: version.isDeleteMarker ? 0 : version.object.body.length,
        noncurrentSince: version.noncurrentSince,
        newerVersionsAhead: ahead,
      },
      this.now,
    );
  }
}

/**
 * The versions of one Bucket, gathered under the key each belongs to.
 *
 * A listing already holds each key's versions together and newest first, so
 * this keeps that order and only groups them.
 */
function byKey(
  listed: readonly SimS3ObjectVersion[],
): ReadonlyMap<string, SimS3ObjectVersion[]> {
  const grouped = new Map<string, SimS3ObjectVersion[]>();

  for (const version of listed) {
    grouped.set(version.key, [...(grouped.get(version.key) ?? []), version]);
  }

  return grouped;
}
