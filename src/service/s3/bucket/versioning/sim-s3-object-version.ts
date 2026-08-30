import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimS3ObjectLock } from "../lock/sim-s3-object-lock.js";
import type { SimS3Object } from "../../object/s3-object.js";
import { simS3NullVersionId } from "./sim-s3-bucket-versioning.js";

interface SimS3ObjectVersionProperties {
  readonly versionId: string;
  readonly key: string;
  readonly createdAt: Date;
  /**
   * The Object this version holds. A version without one is a delete marker,
   * which records that the key was deleted and holds no bytes.
   */
  readonly object?: SimS3Object | undefined;
}

/**
 * One version of one key in a simulated S3 Bucket.
 *
 * A version is either an Object or a delete marker, and both are versions in
 * every other respect. Both carry an id, both appear in a listing, and both
 * can be deleted by naming that id. Modelling the marker as a version without
 * an Object keeps the ordering in one list, which is what decides which
 * version is current.
 */
export class SimS3ObjectVersion {
  public readonly versionId: string;
  public readonly key: string;

  /**
   * What Object Lock holds against this version.
   *
   * Every version carries one, empty until something is put on it. A Bucket
   * without Object Lock leaves every one of them empty, and an empty lock
   * refuses nothing, so the delete path asks the same question either way.
   */
  public readonly lock = new SimS3ObjectLock();

  private displaced: Date | undefined;

  private readonly createdAt: Date;
  private readonly stored: SimS3Object | undefined;

  constructor(properties: SimS3ObjectVersionProperties) {
    this.versionId = properties.versionId;
    this.key = properties.key;
    this.createdAt = new Date(properties.createdAt);
    this.stored = properties.object;
  }

  /**
   * The version an Object in a Bucket that keeps none reads back under.
   *
   * Real S3 gives every Object in an unversioned Bucket the null version id,
   * and answers ListObjectVersions for one as a history a single entry deep.
   */
  static nullVersionOf(object: SimS3Object): SimS3ObjectVersion {
    return new SimS3ObjectVersion({
      versionId: simS3NullVersionId,
      key: object.key,
      createdAt: object.lastModified,
      object,
    });
  }

  /**
   * Whether this version records a deletion instead of holding bytes.
   */
  get isDeleteMarker(): boolean {
    return this.stored === undefined;
  }

  /**
   * The Object this version holds.
   *
   * A delete marker has none, and asking for one is a caller that skipped
   * `isDeleteMarker`. Reporting that as an error beats handing back nothing,
   * which reads as an empty Object further down.
   */
  get object(): SimS3Object {
    assertDefined(
      this.stored,
      `The Object of S3 version ${this.versionId} of ${this.key}, which is a delete marker`,
    );

    return this.stored;
  }

  /**
   * When this version came into being, in simulated time.
   *
   * A copy, because a Date is mutable and every read of a version hands this
   * one out.
   */
  get lastModified(): Date {
    return new Date(this.createdAt);
  }

  /**
   * When this version stopped being the current one, if it has.
   *
   * A `NoncurrentVersionExpiration` counts from here rather than from the
   * write, because a version written a year ago and displaced yesterday has
   * been noncurrent for a day. Real S3 measures it the same way.
   */
  get noncurrentSince(): Date | undefined {
    const displaced = this.displaced;

    return displaced === undefined ? undefined : new Date(displaced);
  }

  /**
   * Record that a newer version has taken this one's place.
   *
   * Only the first displacement counts. Removing the version that displaced
   * this one makes it current again, and a later write displaces it a second
   * time, which real S3 measures from the later of the two.
   */
  displacedAt(instant: Date): void {
    this.displaced = new Date(instant);
  }

  /**
   * Record that this version is current again, which is what removing the
   * version above it does.
   */
  restored(): void {
    this.displaced = undefined;
  }
}
