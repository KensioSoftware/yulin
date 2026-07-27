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
 * The S3 Block Public Access settings of one simulated Bucket.
 *
 * Real S3 enables all four settings on every new Bucket, so that is what a
 * Bucket gets unless something turns one off.
 *
 * A setting the caller leaves unspecified is taken as enabled. Real S3 replaces
 * the whole configuration on PutPublicAccessBlock, and its documentation does
 * not state what an omitted element means, so the simulator takes the
 * restrictive reading: being stricter than AWS surfaces as a puzzling test
 * failure, while being looser surfaces as a production incident.
 */
export class SimS3PublicAccessBlock {
  private readonly blockPublicAcls: boolean;
  private readonly ignorePublicAcls: boolean;
  private readonly blockPublicPolicy: boolean;
  private readonly restrictPublicBuckets: boolean;

  constructor(configuration: SimS3PublicAccessBlockConfiguration = {}) {
    this.blockPublicAcls = configuration.BlockPublicAcls ?? true;
    this.ignorePublicAcls = configuration.IgnorePublicAcls ?? true;
    this.blockPublicPolicy = configuration.BlockPublicPolicy ?? true;
    this.restrictPublicBuckets = configuration.RestrictPublicBuckets ?? true;
  }

  /**
   * Whether this Bucket refuses a Bucket policy that allows public access.
   */
  blocksPublicPolicy(): boolean {
    return this.blockPublicPolicy;
  }

  /**
   * The configuration as an AWS-shaped record, for GetPublicAccessBlock.
   */
  toConfiguration(): Required<SimS3PublicAccessBlockConfiguration> {
    return {
      BlockPublicAcls: this.blockPublicAcls,
      IgnorePublicAcls: this.ignorePublicAcls,
      BlockPublicPolicy: this.blockPublicPolicy,
      RestrictPublicBuckets: this.restrictPublicBuckets,
    };
  }
}
