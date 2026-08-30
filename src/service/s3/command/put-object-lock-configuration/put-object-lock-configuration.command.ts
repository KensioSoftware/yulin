import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectLockConfigurationInput } from "../../bucket/lock/sim-s3-object-lock-configuration.js";

/**
 * Minimal structural sim S3 PutObjectLockConfiguration command.
 */
export interface SimPutObjectLockConfigurationCommand {
  readonly input: SimPutObjectLockConfigurationCommandInput;
}

/**
 * Minimal structural sim S3 PutObjectLockConfiguration input.
 */
export interface SimPutObjectLockConfigurationCommandInput {
  readonly Bucket?: string | undefined;
  readonly ObjectLockConfiguration?:
    | SimS3ObjectLockConfigurationInput
    | undefined;
}

/**
 * Minimal structural sim S3 PutObjectLockConfiguration output.
 */
export interface SimPutObjectLockConfigurationCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
