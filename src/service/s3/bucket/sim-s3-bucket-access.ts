import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { FilesystemS3BucketStorage } from "../storage/filesystem/s3-filesystem-storage.js";
import { simS3BucketUrl } from "./sim-s3-endpoint-url.js";
import type { SimS3Bucket, SimS3BucketName } from "./sim-s3-bucket.js";

interface SimS3BucketAccessProperties {
  readonly buckets: ReadonlyMap<SimS3BucketName, SimS3Bucket>;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Reaching a Bucket in one simulated S3 scope by name.
 *
 * These are the conveniences a test or a local development setup uses rather
 * than S3 operations an SDK caller would send, so they live here instead of
 * alongside the command delegations on the service facade. Each of them starts
 * by finding the Bucket, and says which name was missing when it is not there.
 */
export class SimS3BucketAccess {
  private readonly buckets: ReadonlyMap<SimS3BucketName, SimS3Bucket>;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimS3BucketAccessProperties) {
    this.buckets = properties.buckets;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Get a Bucket by name, or fail naming the Bucket that is not there.
   */
  required(bucketName: SimS3BucketName | string): SimS3Bucket {
    const bucket = this.buckets.get(bucketName as SimS3BucketName);
    assertDefined(bucket, `Sim S3 Bucket named ${bucketName}`);

    return bucket;
  }

  /**
   * The simulated S3 REST API endpoint URL for one Bucket.
   */
  url(bucketName: SimS3BucketName | string): URL {
    return simS3BucketUrl(
      this.required(bucketName).bucketName,
      this.accountRegionScope.regionName,
    );
  }

  /**
   * The simulated S3 static website URL for one Bucket.
   */
  websiteUrl(bucketName: SimS3BucketName | string): URL {
    return this.required(bucketName).getWebsiteUrl();
  }

  /**
   * Have a Bucket use a local filesystem directory for storage.
   */
  mountFilesystem(
    bucketName: SimS3BucketName | string,
    directoryPath: string,
  ): void {
    this.required(bucketName).configureSimStorage(
      new FilesystemS3BucketStorage({ directoryPath }),
    );
  }
}
