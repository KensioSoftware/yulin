import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3VersioningConfiguration } from "../../bucket/versioning/sim-s3-bucket-versioning.js";

/**
 * Minimal structural sim S3 PutBucketVersioning command.
 */
export interface SimPutBucketVersioningCommand {
  readonly input: SimPutBucketVersioningCommandInput;
}

/**
 * Minimal structural sim S3 PutBucketVersioning input.
 */
export interface SimPutBucketVersioningCommandInput {
  readonly Bucket?: string | undefined;
  readonly VersioningConfiguration?: SimS3VersioningConfiguration | undefined;
}

/**
 * Minimal structural sim S3 PutBucketVersioning output.
 */
export interface SimPutBucketVersioningCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
