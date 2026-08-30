import type { SimS3ObjectVersion } from "./sim-s3-object-version.js";

interface SimS3VersionPageRequest {
  readonly versions: readonly SimS3ObjectVersion[];
  readonly maxKeys: number;
  /** The key the previous page ended on, resumed after rather than at. */
  readonly keyMarker?: string | undefined;
  /**
   * The version the previous page ended on, within `keyMarker`. Without one
   * the whole of that key is behind the marker.
   */
  readonly versionIdMarker?: string | undefined;
}

/**
 * One page of a version listing, and whether the Bucket holds more.
 */
export interface SimS3VersionPage {
  readonly versions: readonly SimS3ObjectVersion[];
  readonly isTruncated: boolean;
  /** Where the next page resumes, present exactly when the listing is truncated. */
  readonly nextKeyMarker: string | undefined;
  readonly nextVersionIdMarker: string | undefined;
}

/**
 * Take the page of a version listing that a request asked for.
 *
 * The markers are a pair rather than one value, because a key can hold more
 * versions than a page has room for and resuming after the key would skip the
 * rest of them. A `VersionIdMarker` resumes inside its key, and a `KeyMarker`
 * on its own resumes at the key after it.
 */
export function simS3VersionPage(
  request: SimS3VersionPageRequest,
): SimS3VersionPage {
  const remaining = simS3VersionsAfterMarker(request);

  // A negative page size would slice versions off the end rather than take
  // none, so a page with no room is empty rather than backwards.
  const page = remaining.slice(0, Math.max(0, request.maxKeys));
  const last = page.at(-1);

  // A page that returned nothing has nowhere for a caller to carry on from, so
  // it is complete however much the Bucket still holds. Reporting it truncated
  // would offer a continuation that cannot exist, and a caller looping until
  // the listing is complete would never stop. `simS3ObjectPage` says the same.
  const isTruncated = last !== undefined && page.length < remaining.length;

  return {
    versions: page,
    isTruncated,
    nextKeyMarker: isTruncated ? last.key : undefined,
    nextVersionIdMarker: isTruncated ? last.versionId : undefined,
  };
}

/**
 * The versions a listing has yet to report, in the order it reports them.
 */
function simS3VersionsAfterMarker(
  request: SimS3VersionPageRequest,
): readonly SimS3ObjectVersion[] {
  const { versions, keyMarker, versionIdMarker } = request;

  if (keyMarker === undefined) {
    return versions;
  }

  if (versionIdMarker === undefined) {
    return versions.filter((version) => version.key > keyMarker);
  }

  const resumeAt = versions.findIndex(
    (version) =>
      version.key === keyMarker && version.versionId === versionIdMarker,
  );

  // A marker pair naming a version that has since been deleted leaves the
  // listing with the keys after that key, which is what real S3 falls back to
  // rather than starting again from the top.
  return resumeAt === -1
    ? versions.filter((version) => version.key > keyMarker)
    : versions.slice(resumeAt + 1);
}
