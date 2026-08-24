import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3LifecycleRule } from "../put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";

/**
 * Minimal structural sim S3 GetBucketLifecycleConfiguration command.
 */
export interface SimGetBucketLifecycleConfigurationCommand {
  readonly input: SimGetBucketLifecycleConfigurationCommandInput;
}

/**
 * Minimal structural sim S3 GetBucketLifecycleConfiguration input.
 */
export interface SimGetBucketLifecycleConfigurationCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 GetBucketLifecycleConfiguration output.
 *
 * The rules come back at the top level rather than under a
 * `LifecycleConfiguration`, which is the asymmetry real S3 has between putting
 * a configuration and reading one.
 */
export interface SimGetBucketLifecycleConfigurationCommandOutput {
  readonly Rules: readonly SimS3LifecycleRule[];
  readonly $metadata: SimResponseMetadata;
}
