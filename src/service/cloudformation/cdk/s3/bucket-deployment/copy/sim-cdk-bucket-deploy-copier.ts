import type { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import { SimCdkBucketDeployFilter } from "../filter/sim-cdk-bucket-deploy-filter.js";
import type { SimCdkBucketDeployNotifier } from "../notify/sim-cdk-bucket-deploy-notifier.js";
import type { SimCdkBucketDeployProperties } from "../property/sim-cdk-bucket-deploy-properties.js";
import { SimCdkBucketDeployFile } from "./sim-cdk-bucket-deploy-file.js";
import { simCdkBucketDeployFiles } from "./sim-cdk-bucket-deploy-files.js";
import { SimCdkBucketDeployPruner } from "./sim-cdk-bucket-deploy-pruner.js";

interface SimCdkBucketDeployCopierProperties {
  readonly bucket: SimS3Bucket;
  readonly properties: SimCdkBucketDeployProperties;
  readonly notifier: SimCdkBucketDeployNotifier;
}

/**
 * Copies a staged CDK asset into a simulated destination Bucket.
 *
 * This is the `aws s3 sync` the provider function runs: the files the filters
 * select become Objects under the destination key prefix, carrying the content
 * headers the deployment was given, and a pruning deployment then removes the
 * Objects in its own view of the Bucket that its source no longer holds.
 *
 * Copying rather than mounting the asset directory is what lets several
 * deployments share a Bucket, which is the usual arrangement whenever the
 * headers differ by file type, since a `BucketDeployment` sets them for all of
 * its files at once.
 */
export class SimCdkBucketDeployCopier {
  private readonly properties: SimCdkBucketDeployProperties;
  private readonly filter: SimCdkBucketDeployFilter;
  private readonly file: SimCdkBucketDeployFile;
  private readonly pruner: SimCdkBucketDeployPruner;

  constructor(properties: SimCdkBucketDeployCopierProperties) {
    this.properties = properties.properties;
    this.filter = new SimCdkBucketDeployFilter({
      exclude: this.properties.exclude,
      include: this.properties.include,
    });
    this.file = new SimCdkBucketDeployFile(properties);
    this.pruner = new SimCdkBucketDeployPruner({
      bucket: properties.bucket,
      filter: this.filter,
      keyPrefix: this.properties.destinationKeyPrefix,
      notifier: properties.notifier,
    });
  }

  /**
   * Copy every source directory into the Bucket, then prune what is left over.
   *
   * The keys it deployed are answered rather than kept, because they are what
   * the deployment can say for certain about the Bucket: storage that holds
   * Objects holds their headers with them, and storage that maps them onto
   * files has only the deployment's word for what they are.
   */
  async copy(
    sourceDirectoryPaths: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const deployedKeys = new Set<string>();

    // One source at a time, because two of them can hold the same path and the
    // sync the provider function runs lets the later one win.
    for (const sourceDirectoryPath of sourceDirectoryPaths) {
      // oxlint-disable-next-line no-await-in-loop -- sources are copied in the order the deployment lists them
      const keys = await this.copyDirectory(sourceDirectoryPath);

      for (const key of keys) {
        deployedKeys.add(key);
      }
    }

    if (this.properties.prune) {
      await this.pruner.prune(deployedKeys);
    }

    return deployedKeys;
  }

  /**
   * Copy the files one source directory holds and the filters select.
   */
  private async copyDirectory(
    sourceDirectoryPath: string,
  ): Promise<readonly string[]> {
    const relativePaths = await simCdkBucketDeployFiles(sourceDirectoryPath);

    return await Promise.all(
      relativePaths
        .filter((relativePath) => this.filter.includes(relativePath))
        .map(async (relativePath) =>
          this.file.copy(sourceDirectoryPath, relativePath),
        ),
    );
  }
}
