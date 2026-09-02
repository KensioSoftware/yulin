import type { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import type { SimCdkBucketDeployFilter } from "../filter/sim-cdk-bucket-deploy-filter.js";
import type { SimCdkBucketDeployNotifier } from "../notify/sim-cdk-bucket-deploy-notifier.js";

interface SimCdkBucketDeployPrunerProperties {
  readonly bucket: SimS3Bucket;
  readonly filter: SimCdkBucketDeployFilter;
  readonly keyPrefix: string;
  readonly notifier: SimCdkBucketDeployNotifier;
}

/**
 * Removes the Objects a deployment covers but no longer holds.
 *
 * This is the `--delete` the provider function's sync runs. It only considers
 * what passes the filters, on the destination side as well as the source side,
 * so a deployment that excludes a directory does not delete another
 * deployment's Objects in it. That is the whole reason `prune: false` on a
 * second deployment into the same Bucket is a real setting rather than a
 * precaution.
 */
export class SimCdkBucketDeployPruner {
  private readonly bucket: SimS3Bucket;
  private readonly filter: SimCdkBucketDeployFilter;
  private readonly keyPrefix: string;
  private readonly notifier: SimCdkBucketDeployNotifier;

  constructor(properties: SimCdkBucketDeployPrunerProperties) {
    this.bucket = properties.bucket;
    this.filter = properties.filter;
    this.keyPrefix = properties.keyPrefix;
    this.notifier = properties.notifier;
  }

  /**
   * Remove everything this deployment would have copied and did not.
   *
   * Each removal raises what a DeleteObject would have raised, since the sync
   * this stands in for deletes through the API like any other caller.
   */
  async prune(deployedKeys: ReadonlySet<string>): Promise<void> {
    const existing = await this.bucket.listObjects(this.keyPrefix);
    const stale = existing.filter((object) =>
      this.isStale(object.key, deployedKeys),
    );

    await Promise.all(
      stale.map(async (object) => {
        const deletion = await this.bucket.deleteObject(object.key);

        this.notifier.pruned(object.key, deletion);
      }),
    );
  }

  private isStale(key: string, deployedKeys: ReadonlySet<string>): boolean {
    return (
      !deployedKeys.has(key) &&
      this.filter.includes(key.slice(this.keyPrefix.length))
    );
  }
}
