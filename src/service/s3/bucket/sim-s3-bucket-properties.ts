import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import type { SimS3BucketStorage } from "../storage/s3-bucket-storage.js";
import type { SimS3BucketEncryption } from "./encryption/sim-s3-bucket-encryption.js";
import type { SimS3LifecycleConfiguration } from "./lifecycle/sim-s3-lifecycle-configuration.js";
import type { SimS3NotificationConfiguration } from "./notification/sim-s3-notification-configuration.js";
import type { SimS3PublicAccessBlock } from "./public-access/sim-s3-public-access-block.js";
import type { SimS3BucketName } from "./sim-s3-bucket.js";
import type { SimS3BucketWebsite } from "./website/sim-s3-bucket-website.js";

/**
 * What a simulated S3 Bucket is made of.
 *
 * Every one of these has a default, apart from the name. A Bucket made by
 * CreateBucket states only its name and its scope, and the configuration
 * properties are what a Bucket built directly in a test starts out with.
 */
export interface SimS3BucketProperties {
  readonly bucketName: SimS3BucketName | string;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly storage?: SimS3BucketStorage;
  readonly website?: SimS3BucketWebsite;
  readonly policy?: SimIamPolicyDocument | undefined;
  readonly publicAccessBlock?: SimS3PublicAccessBlock;
  readonly notifications?: SimS3NotificationConfiguration;
  readonly lifecycle?: SimS3LifecycleConfiguration;
  readonly encryption?: SimS3BucketEncryption;
  /**
   * The simulation's sense of time, which is what a lifecycle rule is measured
   * against. A Bucket made outside a simulated environment has none to be
   * given, and runs on the host clock.
   */
  readonly clock?: SimClock;
  /**
   * When the Bucket came into being, in simulated time.
   *
   * Real S3 reports this on every Bucket a listing returns, and the `aws` CLI
   * reads it from each entry, so a Bucket without one cannot be listed.
   */
  readonly creationDate?: Date;
}
