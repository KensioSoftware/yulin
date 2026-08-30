import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3RetentionInput } from "../../bucket/lock/sim-s3-object-retention.js";

/**
 * Minimal structural sim S3 PutObjectRetention command.
 */
export interface SimPutObjectRetentionCommand {
  readonly input: SimPutObjectRetentionCommandInput;
}

/**
 * Minimal structural sim S3 PutObjectRetention input.
 */
export interface SimPutObjectRetentionCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /** The version to retain. A request naming none retains the current one. */
  readonly VersionId?: string | undefined;
  readonly Retention?: SimS3RetentionInput | undefined;
  /**
   * Whether to shorten a governance retention period already on the version,
   * which the caller also needs `s3:BypassGovernanceRetention` for.
   */
  readonly BypassGovernanceRetention?: boolean | undefined;
}

/**
 * Minimal structural sim S3 PutObjectRetention output.
 */
export interface SimPutObjectRetentionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
