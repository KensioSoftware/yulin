import { assertDefined } from "../../../../util/type-guard/defined.js";
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
}
