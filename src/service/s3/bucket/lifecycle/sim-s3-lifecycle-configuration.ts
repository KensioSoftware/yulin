import type {
  SimS3LifecycleConfiguration as SimS3LifecycleConfigurationInput,
  SimS3LifecycleRule,
} from "../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";
import {
  simS3LifecycleReached,
  simS3NoncurrentExpiryInstant,
  simS3ObjectExpiryInstant,
  simS3UploadAbortInstant,
} from "./sim-s3-lifecycle-expiry.js";
import { simS3LifecycleRuleSelects } from "./sim-s3-lifecycle-selection.js";

interface SimS3LifecycleConfigurationProperties {
  readonly rules?: readonly SimS3LifecycleRule[];
}

/**
 * An Object as a lifecycle rule reads it.
 */
export interface SimS3LifecycleObject {
  readonly key: string;
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
export interface SimS3LifecycleNoncurrentVersion {
  readonly key: string;
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

/**
 * The lifecycle configuration of one simulated S3 Bucket.
 *
 * A Bucket has one configuration rather than a list of them, which is why
 * PutBucketLifecycleConfiguration replaces the whole thing. Real S3 has no way
 * to add one rule without restating the others.
 *
 * The configuration also answers what its rules have expired. An Object goes
 * once the clock passes the boundary of a rule that selects it, and a Bucket
 * asks on the way to its storage. Nothing sweeps a Bucket on a schedule. See
 * `simS3ObjectExpiryInstant` for why the boundary is a pure function of the
 * current time.
 */
export class SimS3LifecycleConfiguration {
  private readonly storedRules: readonly SimS3LifecycleRule[];

  constructor(properties: SimS3LifecycleConfigurationProperties = {}) {
    this.storedRules = structuredClone(properties.rules ?? []);
  }

  /**
   * The configuration a Bucket nobody has configured has.
   */
  static empty(): SimS3LifecycleConfiguration {
    return new SimS3LifecycleConfiguration();
  }

  /**
   * The configuration a PutBucketLifecycleConfiguration request asks for.
   */
  static fromConfiguration(
    configuration: SimS3LifecycleConfigurationInput,
  ): SimS3LifecycleConfiguration {
    return new SimS3LifecycleConfiguration({
      rules: [...(configuration.Rules ?? [])],
    });
  }

  /**
   * The rules this Bucket carries.
   *
   * Cloned on the way out as they were on the way in. A caller holding the
   * objects it put, or the ones a read gave it, could otherwise change what
   * the Bucket is configured with by mutating them.
   */
  get rules(): readonly SimS3LifecycleRule[] {
    return structuredClone(this.storedRules);
  }

  /**
   * Whether the Bucket carries any rule at all.
   *
   * Real S3 distinguishes a Bucket with no configuration from one with an
   * empty list of rules only in that it refuses to store the latter, so an
   * unconfigured Bucket and a Bucket whose rules were all removed read alike.
   */
  get isEmpty(): boolean {
    return this.storedRules.length === 0;
  }

  /**
   * Whether an enabled rule has expired an Object by the given instant.
   *
   * One rule is enough. Real S3 applies the shortest expiry among the rules
   * selecting a key, and an Object past any of the boundaries is past the
   * shortest one.
   */
  expires(object: SimS3LifecycleObject, now: Date): boolean {
    return this.enabledRules.some(
      (rule) =>
        rule.Expiration !== undefined &&
        simS3LifecycleRuleSelects(rule, object) &&
        simS3LifecycleReached(
          simS3ObjectExpiryInstant(rule.Expiration, object.lastModified),
          now,
        ),
    );
  }

  /**
   * Whether an enabled rule has expired a noncurrent version by the given
   * instant.
   *
   * `NewerNoncurrentVersions` holds that many of the most recent noncurrent
   * versions back from the rule, whatever their age, so a rule keeping two
   * reaches the third and everything older.
   */
  expiresNoncurrent(
    version: SimS3LifecycleNoncurrentVersion,
    now: Date,
  ): boolean {
    return this.enabledRules.some((rule) => {
      const expiration = rule.NoncurrentVersionExpiration;

      return (
        expiration !== undefined &&
        version.newerVersionsAhead >=
          (expiration.NewerNoncurrentVersions ?? 0) &&
        simS3LifecycleRuleSelects(rule, version) &&
        simS3LifecycleReached(
          simS3NoncurrentExpiryInstant(expiration, version.noncurrentSince),
          now,
        )
      );
    });
  }

  /**
   * Whether an enabled rule removes a delete marker with nothing left under
   * it.
   *
   * Real S3 calls that an expired object delete marker and takes it away on
   * its next pass, with no period to wait out. The marker is what keeps the
   * key in a listing once its last version has gone.
   */
  expiresDeleteMarker(key: string): boolean {
    return this.enabledRules.some(
      (rule) =>
        rule.Expiration?.ExpiredObjectDeleteMarker === true &&
        simS3LifecycleRuleSelects(rule, { key }),
    );
  }

  /**
   * Whether an enabled rule has abandoned a multipart upload by the given
   * instant.
   */
  abandons(upload: SimS3LifecycleUpload, now: Date): boolean {
    return this.enabledRules.some(
      (rule) =>
        rule.AbortIncompleteMultipartUpload !== undefined &&
        simS3LifecycleRuleSelects(rule, { key: upload.key }) &&
        simS3LifecycleReached(
          simS3UploadAbortInstant(
            rule.AbortIncompleteMultipartUpload,
            upload.initiated,
          ),
          now,
        ),
    );
  }

  /**
   * The rules that act, which are the ones whose `Status` is `Enabled`.
   *
   * Read from the stored rules rather than from `rules`, because every read of
   * a Bucket asks and cloning the whole configuration each time would be the
   * cost of having one. A transition is worked out from these by
   * `simS3TransitionedObjectClass`.
   */
  get enabledRules(): readonly SimS3LifecycleRule[] {
    return this.storedRules.filter((rule) => rule.Status === "Enabled");
  }
}
