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
  /** The last key on the page, which is what a caller resumes after. */
  readonly lastKey: string | undefined;
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

  const objects = remaining.slice(0, Math.max(0, request.maxKeys));

  return {
    objects,
    isTruncated: objects.length < remaining.length,
    lastKey: objects.at(-1)?.key,
  };
}

/**
 * How many keys a listing will actually return.
 *
 * Real S3 treats MaxKeys as an upper bound it is free to lower, and never
 * returns more than a page holds however many the caller asks for. A request
 * that names no MaxKeys is asking for a full page.
 */
export function simS3EffectiveMaxKeys(
  requestedMaxKeys: number | undefined,
  maxKeysPerPage: number,
): number {
  return Math.min(requestedMaxKeys ?? maxKeysPerPage, maxKeysPerPage);
}

function compareObjectKeys(a: SimS3Object, b: SimS3Object): number {
  /* v8 ignore if -- a Bucket holds one Object per key, so no two keys are equal */
  if (a.key === b.key) {
    return 0;
  }

  return a.key < b.key ? -1 : 1;
}
