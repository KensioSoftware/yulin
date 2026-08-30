import { compareSimS3Keys } from "./sim-s3-compare-keys.js";
import type { SimS3ObjectVersion } from "./sim-s3-object-version.js";

/**
 * The versions one simulated S3 Bucket holds, by key.
 *
 * Each key's versions are kept newest first, which makes the current version
 * the head of the list and keeps a listing in the order real S3 answers in.
 * ListObjectVersions runs through the keys in ascending order and gives each
 * key's versions newest first, so the two orderings together are the whole
 * response shape.
 */
export class SimS3ObjectVersions {
  private readonly byKey = new Map<string, SimS3ObjectVersion[]>();

  /**
   * Put a version at the head of its key, making it the current one.
   */
  add(version: SimS3ObjectVersion): void {
    const versions = this.byKey.get(version.key) ?? [];
    this.byKey.set(version.key, [version, ...versions]);
  }

  /**
   * Put a version at the head of its key, dropping any other version sharing
   * its id first.
   *
   * This is what a write to a suspended Bucket does. Every such write takes
   * the null version id, and real S3 holds one version under that id rather
   * than a run of them, so the new write replaces the old one in place.
   */
  replace(version: SimS3ObjectVersion): void {
    this.remove(version.key, version.versionId);
    this.add(version);
  }

  /**
   * The version a read of this key without a version id answers with.
   */
  current(key: string): SimS3ObjectVersion | undefined {
    return this.byKey.get(key)?.[0];
  }

  /**
   * Every version of one key, newest first.
   */
  forKey(key: string): readonly SimS3ObjectVersion[] {
    return this.byKey.get(key) ?? [];
  }

  /**
   * One version of one key, by the id it was given.
   */
  find(key: string, versionId: string): SimS3ObjectVersion | undefined {
    return this.forKey(key).find((version) => version.versionId === versionId);
  }

  /**
   * Remove one version of one key, answering the version that went.
   *
   * A key left with no versions is dropped rather than kept as an empty list,
   * which is what stops a listing reporting keys nothing is stored under.
   */
  remove(key: string, versionId: string): SimS3ObjectVersion | undefined {
    const versions = this.byKey.get(key);
    if (versions === undefined) {
      return undefined;
    }

    const removed = versions.find((version) => version.versionId === versionId);
    const kept = versions.filter((version) => version.versionId !== versionId);

    if (kept.length === 0) {
      this.byKey.delete(key);
    } else {
      this.byKey.set(key, kept);
    }

    return removed;
  }

  /**
   * Every version this Bucket holds, in the order a listing reports them.
   */
  list(prefix?: string): readonly SimS3ObjectVersion[] {
    return this.byKey
      .keys()
      .filter((key) => prefix === undefined || key.startsWith(prefix))
      .toArray()
      .toSorted(compareSimS3Keys)
      .flatMap((key) => this.forKey(key));
  }
}
