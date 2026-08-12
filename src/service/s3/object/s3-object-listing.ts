import { SimS3InvalidArgument } from "../error/sim-s3.error.js";
import type { SimS3Object } from "./s3-object.js";

/**
 * The most keys real S3 returns in one page of a listing.
 *
 * A caller asking for more gets this many, which is the whole reason listing
 * code has to handle a continuation at all.
 */
export const simS3DefaultMaxKeysPerPage = 1000;

interface SimS3ObjectPageRequest {
  readonly objects: readonly SimS3Object[];
  /** The key to resume after, exclusive, or nothing to start at the first. */
  readonly startAfter?: string | undefined;
  readonly maxKeys: number;
}

/**
 * One page of a Bucket listing, and whether the Bucket holds more.
 */
export interface SimS3ObjectPage {
  readonly objects: readonly SimS3Object[];
  readonly isTruncated: boolean;
  /**
   * The key the next page resumes after, which is there exactly when the
   * listing is truncated, so a caller cannot be offered one that goes nowhere.
   */
  readonly resumeAfter: string | undefined;
}

/**
 * Order a Bucket's Objects and take the page a listing asked for.
 *
 * ListObjects and ListObjectsV2 share this because they share it in real S3:
 * they differ in how a caller names where to resume and in how the response
 * reports it, never in which keys come back.
 *
 * S3 orders keys by their UTF-8 bytes and resumes strictly after the key it is
 * given, whether or not the Bucket still holds that key. Both are done here by
 * comparing the strings directly, which agrees with S3 for every key that is
 * not made of characters outside the basic multilingual plane.
 */
export function simS3ObjectPage(
  request: SimS3ObjectPageRequest,
): SimS3ObjectPage {
  const ordered = request.objects.toSorted(compareObjectKeys);
  const startAfter = request.startAfter;
  const remaining =
    startAfter === undefined
      ? ordered
      : ordered.filter((object) => object.key > startAfter);

  // A negative page size would slice keys off the end rather than take none,
  // so a page with no room is empty rather than backwards.
  const objects = remaining.slice(0, Math.max(0, request.maxKeys));
  const lastKey = objects.at(-1)?.key;

  // A page that returned no keys has nowhere for a caller to carry on from, so
  // it is complete however much the Bucket still holds. Reporting it truncated
  // would offer a continuation that cannot exist, and a caller looping until
  // the listing is complete would never stop.
  const isTruncated =
    lastKey !== undefined && objects.length < remaining.length;

  return {
    objects,
    isTruncated,
    resumeAfter: isTruncated ? lastKey : undefined,
  };
}

/**
 * How many keys a listing will actually return.
 *
 * Real S3 treats MaxKeys as an upper bound it is free to lower, and never
 * returns more than a page holds however many the caller asks for. A request
 * that names no MaxKeys is asking for a full page. Asking for none is allowed
 * and answers with none; asking for fewer than none is refused, as real S3
 * refuses it, rather than being read as some number of keys from the end.
 */
export function simS3EffectiveMaxKeys(
  requestedMaxKeys: number | undefined,
  maxKeysPerPage: number,
): number {
  if (requestedMaxKeys !== undefined && requestedMaxKeys < 0) {
    throw new SimS3InvalidArgument(
      `MaxKeys must not be negative, rather than ${requestedMaxKeys}`,
    );
  }

  return Math.min(requestedMaxKeys ?? maxKeysPerPage, maxKeysPerPage);
}

function compareObjectKeys(a: SimS3Object, b: SimS3Object): number {
  /* v8 ignore if -- a Bucket holds one Object per key, so no two keys are equal */
  if (a.key === b.key) {
    return 0;
  }

  return a.key < b.key ? -1 : 1;
}
