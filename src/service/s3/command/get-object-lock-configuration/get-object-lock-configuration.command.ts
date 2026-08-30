import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectLockConfigurationInput } from "../../bucket/lock/sim-s3-object-lock-configuration.js";

/**
 * Minimal structural sim S3 GetObjectLockConfiguration command.
 */
export interface SimGetObjectLockConfigurationCommand {
  readonly input: SimGetObjectLockConfigurationCommandInput;
}

/**
 * Minimal structural sim S3 GetObjectLockConfiguration input.
 */
export interface SimGetObjectLockConfigurationCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 GetObjectLockConfiguration output.
 *
 * A Bucket that has never had Object Lock answers with
 * `ObjectLockConfigurationNotFoundError` rather than an empty configuration,
 * so this always carries one.
 */
export interface SimGetObjectLockConfigurationCommandOutput {
  readonly ObjectLockConfiguration: SimS3ObjectLockConfigurationInput;
  readonly $metadata: SimResponseMetadata;
}
