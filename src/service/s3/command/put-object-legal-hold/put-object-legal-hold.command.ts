import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3LegalHoldInput } from "../../bucket/lock/sim-s3-object-lock.js";

/**
 * Minimal structural sim S3 PutObjectLegalHold command.
 */
export interface SimPutObjectLegalHoldCommand {
  readonly input: SimPutObjectLegalHoldCommandInput;
}

/**
 * Minimal structural sim S3 PutObjectLegalHold input.
 */
export interface SimPutObjectLegalHoldCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /** The version to hold. A request naming none holds the current one. */
  readonly VersionId?: string | undefined;
  readonly LegalHold?: SimS3LegalHoldInput | undefined;
}

/**
 * Minimal structural sim S3 PutObjectLegalHold output.
 */
export interface SimPutObjectLegalHoldCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
