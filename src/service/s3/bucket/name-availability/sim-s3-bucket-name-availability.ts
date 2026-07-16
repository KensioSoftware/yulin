import type { SimS3GlobalRegistry } from "../../sim-s3-global-registry.js";
import type { SimS3Bucket, SimS3BucketName } from "../sim-s3-bucket.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimS3BucketAlreadyExists,
  SimS3BucketAlreadyOwnedByYou,
} from "../../error/sim-s3.error.js";

interface SimS3BucketNameAvailabilityProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly buckets: Map<string, SimS3Bucket>;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
}

/**
 * Checks whether an S3 Bucket name is available in a simulated AWS scope.
 */
export class SimS3BucketNameAvailability {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly buckets: Map<string, SimS3Bucket>;
  private readonly s3GlobalRegistry: SimS3GlobalRegistry;

  constructor(props: SimS3BucketNameAvailabilityProps) {
    const { accountRegionScope, buckets, s3GlobalRegistry } = props;

    this.accountRegionScope = accountRegionScope;
    this.buckets = buckets;
    this.s3GlobalRegistry = s3GlobalRegistry;
  }

  /**
   * Throw if the Bucket name cannot be created in this simulated scope.
   */
  ensureCanCreateBucketNamed(bucketName: SimS3BucketName): void {
    const existingBucketScope =
      this.s3GlobalRegistry.findBucketScope(bucketName);

    if (existingBucketScope !== undefined) {
      this.throwForExistingBucket(bucketName, existingBucketScope);
    }

    this.ensureLocalBucketRegistered(bucketName);
  }

  private throwForExistingBucket(
    bucketName: SimS3BucketName,
    existingBucketScope: SimAwsAccountRegionScope,
  ): never {
    if (existingBucketScope.accountId === this.accountRegionScope.accountId) {
      throw new SimS3BucketAlreadyOwnedByYou(
        `S3 Bucket ${bucketName} already exists in ${existingBucketScope.regionName} and is owned by ${existingBucketScope.accountId}`,
      );
    }

    throw new SimS3BucketAlreadyExists(
      `S3 Bucket ${bucketName} already exists in ${existingBucketScope.regionName} ${existingBucketScope.accountId}`,
    );
  }

  private ensureLocalBucketRegistered(bucketName: SimS3BucketName): void {
    /* v8 ignore if -- safety catch for situation that cannot happen in normal usage */
    if (!this.buckets.has(bucketName)) {
      return;
    }

    // Somehow the Bucket was absent from the global registry.
    this.s3GlobalRegistry.registerBucket(bucketName, this.accountRegionScope);
    throw new SimS3BucketAlreadyOwnedByYou(
      `S3 Bucket ${bucketName} already exists in ${this.accountRegionScope.regionName} and is owned by ${this.accountRegionScope.accountId}`,
    );
  }
}
