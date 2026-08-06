import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { FilesystemS3BucketStorage } from "../storage/filesystem/s3-filesystem-storage.js";
import { simS3BucketUrl } from "./sim-s3-endpoint-url.js";
import type { SimS3Bucket, SimS3BucketName } from "./sim-s3-bucket.js";
import { SimS3MountWatches } from "../mount/sim-s3-mount-watches.js";
import type { SimS3MountFilesystemOptions } from "../mount/sim-s3-mount.type.js";

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
  private readonly mountWatches = new SimS3MountWatches();

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
   *
   * Given somewhere to reload, the directory is watched here and a build in it
   * reloads the connected browsers once the writes stop. Without that the
   * directory is only named to a `yulin watch` supervisor, so editing a file
   * the Bucket serves restarts the process without the directory having been
   * listed anywhere, and nothing happens outside watch mode.
   */
  mountFilesystem(
    bucketName: SimS3BucketName | string,
    directoryPath: string,
    options: SimS3MountFilesystemOptions = {},
  ): void {
    this.required(bucketName).configureSimStorage(
      new FilesystemS3BucketStorage({ directoryPath }),
    );
    this.mountWatches.register(bucketName, directoryPath, options);
  }

  /**
   * The mounted directories being watched for changes.
   */
  watchedMounts(): readonly string[] {
    return this.mountWatches.paths();
  }

  /**
   * Stop watching mounted directories.
   */
  stopWatchingMounts(): void {
    this.mountWatches.stopAll();
  }
}
