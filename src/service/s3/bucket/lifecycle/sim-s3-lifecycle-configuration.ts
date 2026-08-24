import type {
  SimS3LifecycleConfiguration as SimS3LifecycleConfigurationInput,
  SimS3LifecycleRule,
} from "../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";

interface SimS3LifecycleConfigurationProperties {
  readonly rules?: readonly SimS3LifecycleRule[];
}

/**
 * The lifecycle configuration of one simulated S3 Bucket.
 *
 * Simulated S3 holds the rules and hands them back. Objects live for as long
 * as the simulation runs, whatever a rule says, so a rule here is a record of
 * what the Bucket was configured with. Expiring Objects against one is #984.
 *
 * A Bucket has one configuration rather than a list of them, which is why
 * PutBucketLifecycleConfiguration replaces the whole thing. Real S3 has no way
 * to add one rule without restating the others.
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
}
