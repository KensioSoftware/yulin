import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import {
  SimS3Object,
  SimS3ObjectMetadata,
} from "../../../../../s3/object/s3-object.js";
import { metadataForFilesystemS3ObjectKey } from "../../../../../s3/storage/filesystem/s3-filesystem-object-metadata.js";
import type { SimCdkBucketDeployProperties } from "../property/sim-cdk-bucket-deploy-properties.js";

interface SimCdkBucketDeployFileProperties {
  readonly bucket: SimS3Bucket;
  readonly properties: SimCdkBucketDeployProperties;
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

  constructor(properties: SimCdkBucketDeployFileProperties) {
    this.bucket = properties.bucket;
    this.properties = properties.properties;
  }

  /**
   * Store one file as an Object, and answer with the key it went under.
   */
  async copy(
    sourceDirectoryPath: string,
    relativePath: string,
  ): Promise<string> {
    const key = this.properties.objectKey(relativePath);
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    const body = await readFile(path.join(sourceDirectoryPath, relativePath));

    await this.bucket.putObject(
      new SimS3Object({ key, body, metadata: this.metadata(relativePath) }),
    );

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
