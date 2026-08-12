import { simS3QuotedETag } from "./s3-object-etag.js";
import type { SimS3Object } from "./s3-object.js";

/**
 * The storage class S3 reports for an Object nobody asked to store elsewhere.
 *
 * Storage classes are not simulated, and this is the one real S3 puts an Object
 * in unless told otherwise. It is reported rather than omitted because a
 * listing that leaves it out reads as an Object of unknown class, which is a
 * different thing from a Standard one.
 */
const defaultStorageClass = "STANDARD";

/**
 * One Object as a listing describes it.
 *
 * Both list operations answer with these, because ListObjects and
 * ListObjectsV2 differ in how a caller asks for a page and how the page is
 * bounded, never in what an Object in one looks like.
 */
export interface SimS3ObjectSummary {
  readonly Key?: string;
  readonly Size?: number;
  readonly ETag?: string;
  readonly LastModified?: Date;
  readonly StorageClass?: string;
}

/**
 * Describe a stored Object the way a listing does.
 *
 * The ETag is the quoted form, matching what GetObject and PutObject answer
 * with, so a caller can compare a listed Object against one it has read without
 * having to know that S3 quotes an entity tag in one place and not another.
 */
export function simS3ObjectSummary(object: SimS3Object): SimS3ObjectSummary {
  return {
    Key: object.key,
    Size: object.body.length,
    ETag: simS3QuotedETag(object.etag),
    LastModified: object.lastModified,
    StorageClass: defaultStorageClass,
  };
}

/**
 * Describe the Objects on a page of a listing, or nothing when it holds none.
 *
 * A listing that found no keys has no `Contents` at all in real S3, rather than
 * an empty one, which is why every caller written against it reaches for
 * `Contents ?? []`. Answering with an empty array here would let a caller that
 * skipped the guard pass a test and fail against AWS.
 */
export function simS3ObjectSummaries(
  objects: readonly SimS3Object[],
): SimS3ObjectSummary[] | undefined {
  return objects.length === 0
    ? undefined
    : objects.map((object) => simS3ObjectSummary(object));
}
