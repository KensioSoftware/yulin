import type { SimS3ObjectVersion } from "./versioning/sim-s3-object-version.js";

interface SimS3ObjectDeletionProperties {
  readonly removedObject?: boolean;
  readonly deleteMarker?: SimS3ObjectVersion | undefined;
}

/**
 * What a delete did to a simulated S3 Bucket.
 *
 * The two outcomes are separate because the event notification they raise is.
 * A Bucket without versioning loses the Object and raises
 * `s3:ObjectRemoved:Delete`. A versioned Bucket keeps the Object and hides it
 * behind a marker, which is `s3:ObjectRemoved:DeleteMarkerCreated`. A delete
 * of a key that held nothing raises neither.
 */
export class SimS3ObjectDeletion {
  public readonly removedObject: boolean;
  public readonly deleteMarker: SimS3ObjectVersion | undefined;

  constructor(properties: SimS3ObjectDeletionProperties = {}) {
    this.removedObject = properties.removedObject ?? false;
    this.deleteMarker = properties.deleteMarker;
  }

  /**
   * What a response says about this delete.
   *
   * A versioned Bucket reports the marker it wrote and the id it wrote it
   * under. A Bucket without versioning reports neither, as real S3 does.
   */
  get reported(): {
    readonly DeleteMarker?: boolean;
    readonly VersionId?: string;
  } {
    if (this.deleteMarker === undefined) {
      return {};
    }

    return { DeleteMarker: true, VersionId: this.deleteMarker.versionId };
  }
}
