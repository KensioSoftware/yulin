import type {
  SimS3LifecycleNoncurrentVersionTransition,
  SimS3LifecycleTransition,
} from "../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";
import {
  simS3StorageClassFrom,
  type SimS3StorageClass,
} from "../../object/s3-storage-class.js";
import type { SimS3LifecycleNoncurrentVersion } from "./sim-s3-lifecycle-configuration.js";
import {
  simS3LifecycleAfterDays,
  simS3LifecycleReached,
} from "./sim-s3-lifecycle-expiry.js";

/**
 * One transition a rule has reached, as the class it moves an Object into and
 * the instant it moved.
 *
 * The instant is what decides between two transitions that have both been
 * reached. Real S3 walks an Object down the classes a rule lists as their days
 * pass, so the one that came last is where the Object is now.
 */
export interface SimS3ReachedTransition {
  readonly storageClass: SimS3StorageClass;
  readonly at: Date;
}

/**
 * The transition a `Transitions` entry has made by an instant, if it has.
 *
 * `Days` counts from when the Object was written and `Date` names the day
 * itself, the same two forms an `Expiration` takes. A transition naming
 * neither, or naming no storage class, moves nothing.
 */
export function simS3ReachedTransitionOf(
  transition: SimS3LifecycleTransition,
  writtenAt: Date,
  now: Date,
): SimS3ReachedTransition | undefined {
  return reached(
    transitionInstant(transition, writtenAt),
    transition.StorageClass,
    now,
  );
}

/**
 * The transition a `NoncurrentVersionTransitions` entry has made by an
 * instant, counted from when the version stopped being the current one.
 *
 * A version that is still current has no such instant, as it has none for a
 * `NoncurrentVersionExpiration`. `NewerNoncurrentVersions` holds back the most
 * recent noncurrent versions as it does for an expiry, so a rule keeping two
 * reaches the third and everything older.
 */
export function simS3ReachedNoncurrentTransitionOf(
  transition: SimS3LifecycleNoncurrentVersionTransition,
  version: SimS3LifecycleNoncurrentVersion,
  now: Date,
): SimS3ReachedTransition | undefined {
  const { noncurrentSince } = version;

  if (
    noncurrentSince === undefined ||
    transition.NoncurrentDays === undefined ||
    version.newerVersionsAhead < (transition.NewerNoncurrentVersions ?? 0)
  ) {
    return undefined;
  }

  return reached(
    simS3LifecycleAfterDays(noncurrentSince, transition.NoncurrentDays),
    transition.StorageClass,
    now,
  );
}

function transitionInstant(
  transition: SimS3LifecycleTransition,
  writtenAt: Date,
): Date | undefined {
  if (transition.Days !== undefined) {
    return simS3LifecycleAfterDays(writtenAt, transition.Days);
  }

  if (transition.Date !== undefined) {
    return new Date(transition.Date);
  }

  return undefined;
}

function reached(
  at: Date | undefined,
  storageClass: string | undefined,
  now: Date,
): SimS3ReachedTransition | undefined {
  const target = simS3StorageClassFrom(storageClass, "a lifecycle transition");

  if (at === undefined || target === undefined) {
    return undefined;
  }

  return simS3LifecycleReached(at, now)
    ? { storageClass: target, at }
    : undefined;
}
