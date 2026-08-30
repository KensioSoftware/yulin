import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 GetBucketVersioning command.
 */
export interface SimGetBucketVersioningCommand {
  readonly input: SimGetBucketVersioningCommandInput;
}

/**
 * Minimal structural sim S3 GetBucketVersioning input.
 */
export interface SimGetBucketVersioningCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 GetBucketVersioning output.
 *
 * A Bucket nobody has configured answers with neither field, which is how real
 * S3 separates an unversioned Bucket from a suspended one.
 */
export interface SimGetBucketVersioningCommandOutput {
  readonly Status?: "Enabled" | "Suspended" | undefined;
  readonly $metadata: SimResponseMetadata;
}
