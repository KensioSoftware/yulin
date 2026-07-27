/**
 * Structural shape of an S3 PublicAccessBlockConfiguration.
 *
 * Matches the AWS SDK and CloudFormation property shape, so the same object can
 * come from either.
 */
export interface SimS3PublicAccessBlockConfiguration {
  readonly BlockPublicAcls?: boolean | undefined;
  readonly IgnorePublicAcls?: boolean | undefined;
  readonly BlockPublicPolicy?: boolean | undefined;
  readonly RestrictPublicBuckets?: boolean | undefined;
}

/**
 * A Block Public Access configuration with every setting settled.
 *
 * The AWS-facing shape leaves all four optional, so this is what the simulator
 * holds once the omissions have been resolved.
 */
export interface SimS3PublicAccessBlockSettings {
  readonly BlockPublicAcls: boolean;
  readonly IgnorePublicAcls: boolean;
  readonly BlockPublicPolicy: boolean;
  readonly RestrictPublicBuckets: boolean;
}

/**
 * The S3 Block Public Access settings of one simulated Bucket.
 *
 * There are two distinct states here and they are not the same. A Bucket nobody
 * has configured blocks everything, which is what real S3 does for every new
 * Bucket. A Bucket someone has configured has exactly what they asked for: the
 * configuration replaces the previous one wholesale, so a setting left out of
 * it is off rather than inherited.
 *
 * That second rule matters more than it looks. CDK's `BlockPublicAccess.
 * BLOCK_ACLS` sets only `blockPublicAcls` and `ignorePublicAcls`, leaving
 * `BlockPublicPolicy` out of the synthesized template, and pairing it with
 * `publicReadAccess` is the standard way to build a public website Bucket.
 * Treating the omitted setting as enabled would refuse that template, which
 * real AWS deploys without complaint.
 */
export class SimS3PublicAccessBlock {
  private constructor(
    private readonly settings: SimS3PublicAccessBlockSettings,
  ) {}

  /**
   * The all-blocked state a Bucket has until something configures it.
   */
  static blockingAll(): SimS3PublicAccessBlock {
    return new SimS3PublicAccessBlock({
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: true,
      RestrictPublicBuckets: true,
    });
  }

  /**
   * A configuration exactly as supplied, with anything omitted turned off.
   */
  static fromConfiguration(
    configuration: SimS3PublicAccessBlockConfiguration,
  ): SimS3PublicAccessBlock {
    return new SimS3PublicAccessBlock({
      BlockPublicAcls: configuration.BlockPublicAcls ?? false,
      IgnorePublicAcls: configuration.IgnorePublicAcls ?? false,
      BlockPublicPolicy: configuration.BlockPublicPolicy ?? false,
      RestrictPublicBuckets: configuration.RestrictPublicBuckets ?? false,
    });
  }

  /**
   * Whether this Bucket refuses a Bucket policy that allows public access.
   */
  blocksPublicPolicy(): boolean {
    return this.settings.BlockPublicPolicy;
  }

  /**
   * The configuration as an AWS-shaped record, for GetPublicAccessBlock.
   */
  toConfiguration(): SimS3PublicAccessBlockSettings {
    return { ...this.settings };
  }
}
