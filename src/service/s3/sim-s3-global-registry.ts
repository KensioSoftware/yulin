import type { SimS3BucketName } from "./bucket/sim-s3-bucket.js";

import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";

/**
 * Simulate global existence of S3 Buckets across Account and Region scopes.
 * Note that despite the label "global", this is still encapsulated.
 * SimAws manages a singleton of this registry, but it can be freely
 * instantiated for isolated state.
 * The word "global" here refers to the cross-region aspect of S3 Buckets.
 */
export class SimS3GlobalRegistry {
  private readonly bucketScopes = new Map<
    SimS3BucketName,
    SimAwsAccountRegionScope
  >();

  /**
   * Register a Bucket with its Account and Region scope.
   */
  registerBucket(
    bucketName: SimS3BucketName,
    scope: SimAwsAccountRegionScope,
  ): void {
    this.bucketScopes.set(bucketName, scope);
  }

  /**
   * Release a Bucket name, so it can be claimed again.
   *
   * S3 Bucket names are globally unique while the Bucket exists and no longer
   * than that, so deleting a Bucket has to give the name back.
   */
  deregisterBucket(bucketName: SimS3BucketName): void {
    this.bucketScopes.delete(bucketName);
  }

  /**
   * Look up the Account Region scope for a Bucket by Bucket name.
   */
  findBucketScope(
    bucketName: SimS3BucketName,
  ): SimAwsAccountRegionScope | undefined {
    return this.bucketScopes.get(bucketName);
  }
}
