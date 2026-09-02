import type { SimS3ObjectTagSet } from "../../object/s3-object-tags.js";

/**
 * What a lifecycle rule looks at to decide whether it selects something.
 *
 * An Object states its size and its tags, and a multipart upload states
 * neither. Half an upload has no size for a rule to measure, and real S3 has no
 * size to measure either until the parts are joined. A delete marker holds no
 * Object, so it carries no tags for a rule to match.
 */
export interface SimS3LifecycleSubject {
  readonly key: string;
  readonly size?: number | undefined;
  readonly tags?: SimS3ObjectTagSet | undefined;
}

/**
 * An Object as a lifecycle rule reads it.
 */
export interface SimS3LifecycleObject extends SimS3LifecycleSubject {
  readonly size: number;
  readonly lastModified: Date;
}

/**
 * A noncurrent version as a lifecycle rule reads it.
 *
 * `newerVersionsAhead` is how many noncurrent versions of the same key are
 * newer than this one, which is what `NewerNoncurrentVersions` counts. The
 * current version is not one of them, since a rule for noncurrent versions
 * never reaches it.
 */
export interface SimS3LifecycleNoncurrentVersion extends SimS3LifecycleSubject {
  readonly size: number;
  readonly noncurrentSince: Date | undefined;
  readonly newerVersionsAhead: number;
}

/**
 * A multipart upload in progress as a lifecycle rule reads it.
 */
export interface SimS3LifecycleUpload {
  readonly key: string;
  readonly initiated: Date;
}
