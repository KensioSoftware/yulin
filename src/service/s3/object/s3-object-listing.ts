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
  /** The prefix the listing asked for, which a delimiter rolls up beneath. */
  readonly prefix?: string | undefined;
  /** The delimiter to roll keys up under, or nothing to list them flat. */
  readonly delimiter?: string | undefined;
  /** The key to resume after, exclusive, or nothing to start at the first. */
  readonly startAfter?: string | undefined;
  readonly maxKeys: number;
}

/**
 * One page of a Bucket listing, and whether the Bucket holds more.
 */
export interface SimS3ObjectPage {
  readonly objects: readonly SimS3Object[];
  /** The prefixes keys were rolled up into, empty without a delimiter. */
  readonly commonPrefixes: readonly string[];
  readonly isTruncated: boolean;
  /**
   * The key or common prefix the next page resumes after, which is there
   * exactly when the listing is truncated, so a caller cannot be offered one
   * that goes nowhere.
   */
  readonly resumeAfter: string | undefined;
}

/**
 * One thing a page of a listing holds: an Object, or a rolled-up prefix.
 *
 * A common prefix stands in for the keys beneath it and has no Object of its
 * own. Both kinds sort and page together under the same name, which is how S3
 * counts a rolled-up prefix against MaxKeys alongside a key.
 */
interface SimS3ListingEntry {
  readonly name: string;
  readonly object?: SimS3Object | undefined;
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
  const entries = listingEntries(request);

  // A negative page size would slice entries off the end rather than take
  // none, so a page with no room is empty rather than backwards.
  const page = entries.slice(0, Math.max(0, request.maxKeys));
  const last = page.at(-1);

  // A page that returned nothing has nowhere for a caller to carry on from, so
  // it is complete however much the Bucket still holds. Reporting it truncated
  // would offer a continuation that cannot exist, and a caller looping until
  // the listing is complete would never stop.
  const isTruncated = last !== undefined && page.length < entries.length;

  return {
    objects: page.filter(hasObject).map((entry) => entry.object),
    commonPrefixes: page
      .filter((entry) => entry.object === undefined)
      .map((entry) => entry.name),
    isTruncated,
    resumeAfter: isTruncated ? last.name : undefined,
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

/**
 * The prefix a delimiter rolls a key up into, or nothing when it holds none.
 *
 * The search starts past the listing's own prefix, because a delimiter inside
 * the prefix a caller asked for has already been walked past. Everything from
 * the start of the key through the first delimiter after that becomes the
 * common prefix, so `img/` covers `img/a.png` and `img/b.png` alike.
 */
function simS3CommonPrefix(
  key: string,
  prefix: string | undefined,
  delimiter: string | undefined,
): string | undefined {
  // An empty delimiter appears in no key, and real S3 lists flat for one.
  if (delimiter === undefined || delimiter === "") {
    return undefined;
  }

  const at = key.indexOf(delimiter, (prefix ?? "").length);

  return at === -1 ? undefined : key.slice(0, at + delimiter.length);
}

/**
 * Everything a listing would return, in order, before the page is taken.
 *
 * Keys arrive sorted, so the keys of one common prefix are neighbours and a
 * rolled-up prefix is recognised by the one before it.
 */
function listingEntries(request: SimS3ObjectPageRequest): SimS3ListingEntry[] {
  const entries: SimS3ListingEntry[] = [];
  let rolledUp: string | undefined;

  for (const object of request.objects.toSorted(compareObjectKeys)) {
    const commonPrefix = simS3CommonPrefix(
      object.key,
      request.prefix,
      request.delimiter,
    );
    if (isBehindTheListing(request.startAfter, object.key, commonPrefix)) {
      continue;
    }

    if (commonPrefix === undefined) {
      entries.push({ name: object.key, object });
      continue;
    }

    if (commonPrefix !== rolledUp) {
      rolledUp = commonPrefix;
      entries.push({ name: commonPrefix });
    }
  }

  return entries;
}

/**
 * Whether a listing resuming after something has already passed a key.
 *
 * A page ending on a common prefix resumes after the prefix itself, and the
 * whole of it is behind the listing however many keys it holds. Resuming after
 * a key compares against the key, as a flat listing does, so a caller that
 * picked its own StartAfter inside a folder still gets that folder back.
 */
function isBehindTheListing(
  startAfter: string | undefined,
  key: string,
  commonPrefix: string | undefined,
): boolean {
  if (startAfter === undefined) {
    return false;
  }

  return commonPrefix === startAfter || key <= startAfter;
}

function hasObject(
  entry: SimS3ListingEntry,
): entry is SimS3ListingEntry & { object: SimS3Object } {
  return entry.object !== undefined;
}

function compareObjectKeys(a: SimS3Object, b: SimS3Object): number {
  /* v8 ignore if -- a Bucket holds one Object per key, so no two keys are equal */
  if (a.key === b.key) {
    return 0;
  }

  return a.key < b.key ? -1 : 1;
}
