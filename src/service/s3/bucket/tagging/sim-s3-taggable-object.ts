import {
  SimS3MethodNotAllowed,
  SimS3NoSuchKey,
  SimS3NoSuchVersion,
} from "../../error/sim-s3.error.js";
import type { SimS3Object } from "../../object/s3-object.js";
import type { SimS3ObjectTagSet } from "../../object/s3-object-tags.js";
import type { SimS3BucketStorage } from "../../storage/s3-bucket-storage.js";
import type { SimS3BucketVersions } from "../versioning/sim-s3-bucket-versions.js";
import type { SimS3ObjectVersion } from "../versioning/sim-s3-object-version.js";

/**
 * What a tagging request names, as a Bucket can answer it.
 *
 * `stored` is what a plain read of the key answers with, which a request
 * naming a version has no need of and passes as nothing.
 */
interface SimS3TaggingTarget {
  readonly storage: SimS3BucketStorage;
  readonly versions: SimS3BucketVersions;
  readonly key: string;
  readonly versionId: string | undefined;
  readonly stored: SimS3Object | undefined;
}

/**
 * The Object a tagging request names, ready to be read or retagged.
 *
 * A tag set lives on the Object, and an Object lives in two places at once on a
 * Bucket that keeps versions: in storage under its key, and in the version
 * history. Retagging the current Object has to reach both, or a read of the key
 * and a read of the version would disagree about the tags. Retagging an older
 * version reaches the history alone, since storage holds nothing of it.
 */
export class SimS3TaggableObject {
  private readonly object: SimS3Object;
  private readonly storage: SimS3BucketStorage;
  private readonly version: SimS3ObjectVersion | undefined;
  private readonly current: boolean;

  private constructor(
    object: SimS3Object,
    storage: SimS3BucketStorage,
    version: SimS3ObjectVersion | undefined,
    current: boolean,
  ) {
    this.object = object;
    this.storage = storage;
    this.version = version;
    this.current = current;
  }

  /**
   * Find the Object a tagging request names, or refuse the request the way
   * real S3 refuses it.
   *
   * A key holding nothing is `NoSuchKey`, an id no version of it was given is
   * `NoSuchVersion`, and a delete marker holds no Object to tag.
   */
  static named(target: SimS3TaggingTarget): SimS3TaggableObject {
    const { storage, versions, key, versionId } = target;

    if (versionId === undefined) {
      if (target.stored === undefined) {
        throw new SimS3NoSuchKey(`No S3 Object named ${key}`);
      }

      return new SimS3TaggableObject(
        target.stored,
        storage,
        versions.current(key),
        true,
      );
    }

    const version = versions.find(key, versionId);

    if (version === undefined) {
      throw new SimS3NoSuchVersion(
        `No version ${versionId} of S3 Object ${key}`,
      );
    }

    if (version.isDeleteMarker) {
      throw new SimS3MethodNotAllowed(
        `Version ${versionId} of S3 Object ${key} is a delete marker`,
      );
    }

    return new SimS3TaggableObject(
      version.object,
      storage,
      version,
      version === versions.current(key),
    );
  }

  /**
   * The tags this Object carries.
   */
  get tagSet(): SimS3ObjectTagSet {
    return this.object.tags;
  }

  /**
   * The version this Object is, on a Bucket keeping versions, which a tagging
   * response reports back.
   */
  get versionId(): string | undefined {
    return this.version?.versionId;
  }

  /**
   * Put a tag set on this Object, answering the Object as it now stands.
   *
   * The version is retagged first so that the Object written back to storage is
   * the one the history holds, rather than an equal Object built alongside it.
   */
  async retag(tags: SimS3ObjectTagSet): Promise<SimS3Object> {
    this.version?.tagged(tags);

    const tagged = this.version?.object ?? this.object.withTags(tags);

    if (this.current) {
      await this.storage.putObject(tagged);
    }

    return tagged;
  }
}
