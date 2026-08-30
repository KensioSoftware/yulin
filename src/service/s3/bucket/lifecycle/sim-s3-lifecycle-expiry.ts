import type {
  SimS3LifecycleAbortIncompleteMultipartUpload,
  SimS3LifecycleExpiration,
  SimS3LifecycleNoncurrentVersionExpiration,
} from "../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/**
 * The instant an `Expiration` puts an Object written at a given time past.
 *
 * Simulated S3 expires an Object the moment the boundary arrives. Real S3
 * removes one some time after it and bills up to the removal, which a test
 * would have to wait out. Exactly on the boundary is the answer a test can
 * use.
 *
 * `Days` wins over `Date` when a rule carries both, though real S3 refuses to
 * store such a rule. An `Expiration` carrying only `ExpiredObjectDeleteMarker`
 * has no boundary at all, because it names a delete marker to remove rather
 * than a period to wait out.
 */
export function simS3ObjectExpiryInstant(
  expiration: SimS3LifecycleExpiration,
  writtenAt: Date,
): Date | undefined {
  if (expiration.Days !== undefined) {
    return afterDays(writtenAt, expiration.Days);
  }

  if (expiration.Date !== undefined) {
    return new Date(expiration.Date);
  }

  return undefined;
}

/**
 * The instant a `NoncurrentVersionExpiration` puts a version past, counted
 * from when that version stopped being the current one.
 *
 * A version that is still current has no such instant, and neither has one
 * under a rule stating only `NewerNoncurrentVersions`. Real S3 requires
 * `NoncurrentDays` alongside that count, and a rule without it names no period
 * to measure.
 */
export function simS3NoncurrentExpiryInstant(
  expiration: SimS3LifecycleNoncurrentVersionExpiration,
  noncurrentSince: Date | undefined,
): Date | undefined {
  if (
    noncurrentSince === undefined ||
    expiration.NoncurrentDays === undefined
  ) {
    return undefined;
  }

  return afterDays(noncurrentSince, expiration.NoncurrentDays);
}

/**
 * The instant an `AbortIncompleteMultipartUpload` abandons an upload started
 * at a given time.
 */
export function simS3UploadAbortInstant(
  abort: SimS3LifecycleAbortIncompleteMultipartUpload,
  initiated: Date,
): Date | undefined {
  if (abort.DaysAfterInitiation === undefined) {
    return undefined;
  }

  return afterDays(initiated, abort.DaysAfterInitiation);
}

/**
 * Whether simulated time has reached a boundary.
 */
export function simS3LifecycleReached(
  boundary: Date | undefined,
  now: Date,
): boolean {
  return boundary !== undefined && now.getTime() >= boundary.getTime();
}

function afterDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * millisecondsPerDay);
}
