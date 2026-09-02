import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import {
  SimS3Object,
  SimS3ObjectMetadata,
} from "../../../../../s3/object/s3-object.js";
import { metadataForFilesystemS3ObjectKey } from "../../../../../s3/storage/filesystem/s3-filesystem-object-metadata.js";
import type { SimCdkBucketDeployNotifier } from "../notify/sim-cdk-bucket-deploy-notifier.js";
import type { SimCdkBucketDeployProperties } from "../property/sim-cdk-bucket-deploy-properties.js";

interface SimCdkBucketDeployFileProperties {
  readonly bucket: SimS3Bucket;
  readonly properties: SimCdkBucketDeployProperties;
  readonly notifier: SimCdkBucketDeployNotifier;
}

/**
 * Copies one file from a staged CDK asset into a simulated Bucket.
 *
 * The Object key is the file's path relative to the asset root, under the
 * deployment's destination key prefix.
 */
export class SimCdkBucketDeployFile {
  private readonly bucket: SimS3Bucket;
  private readonly properties: SimCdkBucketDeployProperties;
  private readonly notifier: SimCdkBucketDeployNotifier;

  constructor(properties: SimCdkBucketDeployFileProperties) {
    this.bucket = properties.bucket;
    this.properties = properties.properties;
    this.notifier = properties.notifier;
  }

  /**
   * Store one file as an Object, and answer with the key it went under.
   *
   * The Object goes into the Bucket rather than through PutObject, so the
   * event a Put would have raised is raised here, once the write has happened
   * and carrying the version it was given.
   */
  async copy(
    sourceDirectoryPath: string,
    relativePath: string,
  ): Promise<string> {
    const key = this.properties.objectKey(relativePath);
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    const body = await readFile(path.join(sourceDirectoryPath, relativePath));

    const object = new SimS3Object({
      key,
      body,
      metadata: this.metadata(relativePath),
    });
    const version = await this.bucket.putObject(object);

    this.notifier.deployed(object, version?.versionId);

    return key;
  }

  /**
   * What S3 will report about the Object.
   *
   * The CLI guesses a content type from the file extension, and the
   * deployment's own system metadata is what the construct was told to set, so
   * it wins.
   */
  private metadata(relativePath: string): SimS3ObjectMetadata {
    return new SimS3ObjectMetadata({
      ...metadataForFilesystemS3ObjectKey(relativePath).values,
      ...Object.fromEntries(this.properties.systemMetadata),
    });
  }
}
