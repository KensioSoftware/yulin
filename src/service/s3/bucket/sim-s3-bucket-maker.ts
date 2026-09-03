import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimS3BucketNameAvailability } from "./name-availability/sim-s3-bucket-name-availability.js";
import { validateS3BucketName } from "./validate/validate-s3-bucket-name.js";
import { SimS3Bucket, type SimS3BucketName } from "./sim-s3-bucket.js";
import type { SimS3GlobalRegistry } from "../sim-s3-global-registry.js";

interface SimS3BucketMakerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
  readonly background: BackgroundScheduler;
}

/**
 * Puts a Bucket into a simulated S3 scope, once something has decided it may
 * be there.
 *
 * `CreateBucketCommand` decides that by authorizing the caller. A Bucket real
 * AWS provisions outside the deployment being simulated, such as the CDK
 * bootstrap staging Bucket, has no caller to authorize and comes through
 * `SimS3.makeSimBucket` instead. Both arrive at the same Bucket registered in
 * the same two places, because the name check and the registration are here
 * rather than in the command handler.
 */
export class SimS3BucketMaker {
  private readonly properties: SimS3BucketMakerProperties;

  constructor(properties: SimS3BucketMakerProperties) {
    this.properties = properties;
  }

  /**
   * Make a Bucket of the given name, reporting a name this scope cannot take
   * the way `CreateBucketCommand` reports it.
   */
  make(bucketName: string): SimS3Bucket {
    const { accountRegionScope, buckets, s3GlobalRegistry, background } =
      this.properties;

    validateS3BucketName(bucketName);
    new SimS3BucketNameAvailability({
      accountRegionScope,
      buckets,
      s3GlobalRegistry,
    }).ensureCanCreateBucketNamed(bucketName);

    const bucket = new SimS3Bucket({
      bucketName,
      accountRegionScope,
      clock: background,
    });

    buckets.set(bucketName, bucket);
    s3GlobalRegistry.registerBucket(bucketName, accountRegionScope);

    return bucket;
  }
}
