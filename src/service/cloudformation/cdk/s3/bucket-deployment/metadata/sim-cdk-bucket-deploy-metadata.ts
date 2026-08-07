import type { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import type { SimS3SystemMetadataDeclaration } from "../../../../../s3/object/s3-system-metadata-declaration.type.js";
import {
  simS3SystemMetadataValues,
  type SimS3SystemMetadataValues,
} from "../../../../../s3/object/s3-system-metadata.js";
import { SimCdkBucketDeployFilter } from "../filter/sim-cdk-bucket-deploy-filter.js";
import type { SimCdkBucketDeployProperties } from "../property/sim-cdk-bucket-deploy-properties.js";

interface SimCdkBucketDeployMetadataProperties {
  readonly properties: SimCdkBucketDeployProperties;

  /** The Object keys this deployment put into the Bucket. */
  readonly publishedKeys: ReadonlySet<string>;
}

/**
 * What a `BucketDeployment` says S3 reports about the Objects it published.
 *
 * The deployment sets these headers on each Object it copies, and an Object
 * keeps them, so nothing reads this while the Bucket is holding what was
 * deployed. It is read when the storage under those Objects is replaced by a
 * mounted directory, which is the local development arrangement: the site is
 * served out of the generator's output as it is rebuilt, from the Bucket the
 * deployment describes, and the files on disk carry none of what it set.
 *
 * The keys it published are what it is sure of. Its destination prefix and its
 * filters are the rule behind them, which is all there is to go on for a file a
 * later build added, and is a guess rather than a fact: two deployments can
 * publish into one prefix and be told apart only by what their sources hold.
 */
export class SimCdkBucketDeployMetadata implements SimS3SystemMetadataDeclaration {
  readonly metadata: SimS3SystemMetadataValues;

  private readonly keyPrefix: string;
  private readonly filter: SimCdkBucketDeployFilter;
  private readonly publishedKeys: ReadonlySet<string>;

  constructor(properties: SimCdkBucketDeployMetadataProperties) {
    const deployProperties = properties.properties;

    this.keyPrefix = deployProperties.destinationKeyPrefix;
    this.filter = new SimCdkBucketDeployFilter({
      exclude: deployProperties.exclude,
      include: deployProperties.include,
    });
    this.metadata = simS3SystemMetadataValues(deployProperties.systemMetadata);
    this.publishedKeys = properties.publishedKeys;
  }

  /** Whether this deployment put the Object under a key into the Bucket. */
  describes(objectKey: string): boolean {
    return this.publishedKeys.has(objectKey);
  }

  /**
   * Whether this deployment would publish a file under a key.
   *
   * The deployment's own rule: under its destination prefix, and selected by
   * its filters, matched against the path relative to the prefix the way the
   * sync matches it against the path relative to the source root.
   */
  wouldDescribe(objectKey: string): boolean {
    return (
      objectKey.startsWith(this.keyPrefix) &&
      this.filter.includes(objectKey.slice(this.keyPrefix.length))
    );
  }
}

interface SimCdkBucketDeployDeclareProperties extends SimCdkBucketDeployMetadataProperties {
  readonly bucket: SimS3Bucket;
  readonly resource: SimCfnResource;
}

/**
 * Tell the destination Bucket what this deployment publishes.
 *
 * The declaration is kept against the Resource it came from, so a Stack
 * redeployed into a running simulator is the same deployment saying its headers
 * again rather than a second one agreeing with it. Two deployments into one
 * Bucket are two Resources and keep two declarations, which is what lets each
 * describe its own files.
 */
export function declareSimCdkBucketDeployMetadata(
  properties: SimCdkBucketDeployDeclareProperties,
): void {
  const { resource } = properties;
  const source = `Custom::CDKBucketDeployment ${resource.stackName ?? "-"}.${resource.logicalId}`;

  properties.bucket
    .getDeclaredSystemMetadata()
    .declare(source, new SimCdkBucketDeployMetadata(properties));
}
